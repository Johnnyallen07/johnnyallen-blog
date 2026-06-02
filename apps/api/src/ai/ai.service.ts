import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  ChatSession,
  Content,
  Part,
} from '@google/generative-ai';
import { GenerateLatexDto, ReferenceFileDto } from './dto/generate-latex.dto';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

interface LatexSession {
  chat: ChatSession;
  latexCode: string;
  history: Content[];
  createdAt: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private model: GenerativeModel | null = null;
  private cos: COS;

  /** In-memory store for LaTeX chat sessions */
  private latexSessions = new Map<string, LatexSession>();

  /** Cleanup interval for expired sessions (30 min TTL) */
  private readonly SESSION_TTL_MS = 30 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey && apiKey !== 'your_gemini_api_key_here') {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      this.logger.log('Gemini AI 已初始化');
    } else {
      this.logger.warn('未配置 GEMINI_API_KEY，AI LaTeX 功能不可用');
    }

    this.cos = new COS({
      SecretId: process.env.COS_SECRET_ID || '',
      SecretKey: process.env.COS_SECRET_KEY || '',
    });

    // Periodically clean up expired sessions
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  private getBucket(): string {
    return process.env.COS_BUCKET || '';
  }

  private getRegion(): string {
    return process.env.COS_REGION || 'ap-hongkong';
  }

  private getPublicDomain(): string {
    const domain = process.env.COS_PUBLIC_DOMAIN?.trim();
    if (domain) return domain.replace(/\/$/, '');
    return `https://${this.getBucket()}.cos.${this.getRegion()}.myqcloud.com`;
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.latexSessions) {
      if (now - session.createdAt > this.SESSION_TTL_MS) {
        this.latexSessions.delete(id);
        this.logger.log(`Cleaned up expired LaTeX session: ${id}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LaTeX 出题 — 基于提示词模板
  // ═══════════════════════════════════════════════════════════

  private buildLatexPrompt(dto: GenerateLatexDto): string {
    const reference = dto.referenceQuestions?.trim() || 'N/A';

    return `You are an expert academic assessment creator and professional LaTeX typesetter. Your task is to generate Free Response Questions (FRQs) based on the parameters provided below. 

Here are the inputs for this task:
- Subject: ${dto.subject}
- Specific Exam Type: ${dto.examType}
- Topic: ${dto.topic}
- Difficulty Level: ${dto.difficulty}
- Number of Questions: ${dto.count}
- Reference Questions (Optional): ${reference}

Please strictly follow these output requirements:
1. LaTeX Only: Output ONLY fully compilable LaTeX code. Do not include any conversational text, introductory greetings, or concluding remarks outside the code block.
2. Compilable Preamble: Include a standard standard preamble (e.g., \`\\documentclass{article}\`, \`\\usepackage{amsmath, amssymb, geometry}\`) and the \`\\begin{document} ... \\end{document}\` environment.
3. No Titles or Headers: Do NOT include \`\\title\`, \`\\author\`, \`\\date\`, or \`\\maketitle\`. 
4. Structure: Directly begin with the \`\\begin{enumerate}\` environment inside the document. All questions must be presented as \`\\item\`.
5. Spacing: Provide appropriate blank space after each question for a student to write their answer (e.g., using \`\\vspace{5cm}\` or \`\\vfill\`).
6. Content Constraints: 
   - All questions must be in English.
   - All questions must be Free Response Questions (FRQs).
   - Do NOT include any complex instructions, hints, grading rubrics, or explanations of what the question is testing. Just present the question directly.
   - The style, depth, and terminology must strictly align with the provided Subject, Exam Type, and Difficulty. If reference questions are provided, mimic their style and complexity.
   - Apply /displaystyle before /frac to make sure the fraction symbol is correctly displayed.
IMPORTANT: Return ONLY the LaTeX code. No markdown code fences, no explanations, no extra text.`;
  }

  /**
   * Build multimodal message parts:
   * [text prompt] + [inline file 1] + [inline file 2] + ...
   */
  private buildMessageParts(
    prompt: string,
    files?: ReferenceFileDto[],
  ): Part[] {
    const parts: Part[] = [{ text: prompt }];

    if (files?.length) {
      for (const file of files) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data, // raw base64, no data:xxx;base64, prefix
          },
        });
      }
    }

    return parts;
  }

  async generateLatex(
    dto: GenerateLatexDto,
  ): Promise<{ sessionId: string; latex: string }> {
    if (!this.model) {
      throw new Error('Gemini AI 未初始化，请检查 GEMINI_API_KEY 配置');
    }

    const prompt = this.buildLatexPrompt(dto);
    const fileCount = dto.referenceFiles?.length ?? 0;
    this.logger.log(
      `生成 LaTeX: ${dto.subject} / ${dto.examType} / ${dto.topic} (${fileCount} 个参考文件)`,
    );

    // Start a new chat session for potential follow-up
    const chat = this.model.startChat({
      history: [],
    });

    // Build multimodal parts (text + optional inline files)
    const parts = this.buildMessageParts(prompt, dto.referenceFiles);
    const result = await chat.sendMessage(parts);
    let latex = result.response.text();

    // Clean up markdown code fences if present
    latex = latex
      .replace(/^```latex\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const sessionId = uuidv4();
    const history = await chat.getHistory();
    this.latexSessions.set(sessionId, {
      chat,
      latexCode: latex,
      history,
      createdAt: Date.now(),
    });

    return { sessionId, latex };
  }

  /**
   * Compile LaTeX to PDF and return the raw PDF buffer (for inline preview).
   */
  async compilePreview(latex: string): Promise<Buffer> {
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'latex-preview-'),
    );

    try {
      const texPath = path.join(tmpDir, 'document.tex');
      await fs.promises.writeFile(texPath, latex, 'utf-8');

      this.logger.log(`编译预览 LaTeX (${latex.length} 字符)`);
      await execFileAsync('pdflatex', [
        '-interaction=nonstopmode',
        '-output-directory',
        tmpDir,
        texPath,
      ]);

      const pdfPath = path.join(tmpDir, 'document.pdf');
      const pdfExists = await fs.promises
        .access(pdfPath)
        .then(() => true)
        .catch(() => false);

      if (!pdfExists) {
        throw new Error('LaTeX 编译失败，未生成 PDF 文件');
      }

      return fs.promises.readFile(pdfPath);
    } finally {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  async chatLatex(
    sessionId: string,
    message: string,
  ): Promise<{ latex: string }> {
    if (!this.model) {
      throw new Error('Gemini AI 未初始化，请检查 GEMINI_API_KEY 配置');
    }

    const session = this.latexSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在或已过期，请重新生成');
    }

    this.logger.log(`LaTeX 对话 [${sessionId}]: ${message.slice(0, 100)}...`);

    const chatPrompt = `Based on the LaTeX code you just generated, please apply the following modification:

${message}

IMPORTANT: Return the COMPLETE updated LaTeX code. No markdown code fences, no explanations, no extra text. Just the full compilable LaTeX document.`;

    const result = await session.chat.sendMessage(chatPrompt);
    let latex = result.response.text();

    // Clean up markdown code fences if present
    latex = latex
      .replace(/^```latex\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    session.latexCode = latex;
    session.history = await session.chat.getHistory();
    session.createdAt = Date.now(); // Refresh TTL

    return { latex };
  }

  async compileAndUploadPdf(
    sessionId: string,
    fileName: string,
    category?: string,
    tags?: string[],
  ): Promise<{
    pdfUrl: string;
    key: string;
    fileName: string;
    category: string;
    tags: string[];
  }> {
    const session = this.latexSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在或已过期，请重新生成');
    }

    const latex = session.latexCode;
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'latex-compile-'),
    );

    try {
      // Write LaTeX to temp file
      const texPath = path.join(tmpDir, 'document.tex');
      await fs.promises.writeFile(texPath, latex, 'utf-8');

      // Compile with pdflatex (run twice for references)
      this.logger.log(`编译 LaTeX: ${texPath}`);
      await execFileAsync('pdflatex', [
        '-interaction=nonstopmode',
        '-output-directory',
        tmpDir,
        texPath,
      ]);

      // Second pass for cross-references
      try {
        await execFileAsync('pdflatex', [
          '-interaction=nonstopmode',
          '-output-directory',
          tmpDir,
          texPath,
        ]);
      } catch {
        // Second pass failure is non-critical
      }

      const pdfPath = path.join(tmpDir, 'document.pdf');
      const pdfExists = await fs.promises
        .access(pdfPath)
        .then(() => true)
        .catch(() => false);

      if (!pdfExists) {
        throw new Error('LaTeX 编译失败，未生成 PDF 文件');
      }

      // Upload to COS
      const fileId = uuidv4();
      const safeName = fileName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_');
      const cosKey = `pdf/${safeName}_${fileId}.pdf`;

      const fileBuffer = await fs.promises.readFile(pdfPath);
      await new Promise<void>((resolve, reject) => {
        this.cos.putObject(
          {
            Bucket: this.getBucket(),
            Region: this.getRegion(),
            Key: cosKey,
            Body: fileBuffer,
            ContentLength: fileBuffer.length,
          },
          (err: unknown) => {
            if (err) {
              reject(
                err instanceof Error
                  ? err
                  : new Error(
                      (err as { message?: string }).message ??
                        'COS upload error',
                    ),
              );
            } else {
              resolve();
            }
          },
        );
      });

      const pdfUrl = `${this.getPublicDomain()}/${cosKey}`;
      const finalCategory = category || 'AI 生成';
      const finalTags = tags?.length ? [...tags] : [];
      if (!finalTags.includes('AI 生成')) {
        finalTags.push('AI 生成');
      }

      this.logger.log(`PDF 上传成功: ${pdfUrl}`);

      // Clean up session
      this.latexSessions.delete(sessionId);

      return {
        pdfUrl,
        key: cosKey,
        fileName: safeName,
        category: finalCategory,
        tags: finalTags,
      };
    } finally {
      // Clean up temp directory
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
