import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiService, GeneratedQuestion } from './ai.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import {
  GenerateLatexDto,
  ChatLatexDto,
  UploadPdfDto,
} from './dto/generate-latex.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  health(): { status: string; message: string } {
    return { status: 'ok', message: 'AI 模块运行正常' };
  }

  @Post('generate-questions')
  @HttpCode(HttpStatus.OK)
  async generateQuestions(
    @Body() dto: GenerateQuestionsDto,
  ): Promise<{ questions: GeneratedQuestion[] }> {
    const questions = await this.aiService.generateQuestions(dto);
    return { questions };
  }

  @Post('generate-latex')
  @HttpCode(HttpStatus.OK)
  async generateLatex(
    @Body() dto: GenerateLatexDto,
  ): Promise<{ sessionId: string; latex: string }> {
    return this.aiService.generateLatex(dto);
  }

  @Post('compile-preview')
  async compilePreview(
    @Body('latex') latex: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.aiService.compilePreview(latex);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length.toString(),
      'Content-Disposition': 'inline; filename="preview.pdf"',
    });
    res.send(pdfBuffer);
  }

  @Post('chat-latex')
  @HttpCode(HttpStatus.OK)
  async chatLatex(@Body() dto: ChatLatexDto): Promise<{ latex: string }> {
    return this.aiService.chatLatex(dto.sessionId, dto.message);
  }

  @Post('upload-pdf')
  @HttpCode(HttpStatus.OK)
  async uploadPdf(@Body() dto: UploadPdfDto): Promise<{
    pdfUrl: string;
    key: string;
    fileName: string;
    category: string;
    tags: string[];
  }> {
    return this.aiService.compileAndUploadPdf(
      dto.sessionId,
      dto.fileName,
      dto.category,
      dto.tags,
    );
  }
}
