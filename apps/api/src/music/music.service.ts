import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMusicTrackDto } from './dto/create-music-track.dto';
import { UpdateMusicTrackDto } from './dto/update-music-track.dto';
import { SplitSegmentDto } from './dto/split-music.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class MusicService {
  private cos: COS;
  private readonly logger = new Logger(MusicService.name);

  constructor(private prisma: PrismaService) {
    this.cos = new COS({
      SecretId: process.env.COS_SECRET_ID || '',
      SecretKey: process.env.COS_SECRET_KEY || '',
    });
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

  private getObjectUrlAsync(
    params: Parameters<COS['getObjectUrl']>[0],
  ): Promise<{ Url: string }> {
    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl(params, (err: unknown, data: { Url?: string }) => {
        if (err)
          reject(
            err instanceof Error
              ? err
              : new Error(
                  (err as { message?: string }).message ?? 'Unknown error',
                ),
          );
        else resolve(data as { Url: string });
      });
    });
  }

  /** Upload a local file to COS and return { key, publicUrl } */
  private async uploadFileToCos(
    localPath: string,
    cosKey: string,
  ): Promise<{ key: string; publicUrl: string }> {
    const fileBuffer = await fs.promises.readFile(localPath);

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
                    (err as { message?: string }).message ?? 'COS upload error',
                  ),
            );
          } else {
            resolve();
          }
        },
      );
    });

    return { key: cosKey, publicUrl: `${this.getPublicDomain()}/${cosKey}` };
  }

  /** Get audio duration in seconds using ffprobe */
  private async getAudioDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        filePath,
      ]);
      return Math.round(parseFloat(stdout.trim()) || 0);
    } catch {
      return 0;
    }
  }

  /** Get file size in bytes */
  private async getFileSize(filePath: string): Promise<number> {
    const stat = await fs.promises.stat(filePath);
    return stat.size;
  }

  /** Clean up temp files, ignoring errors */
  private async cleanupFiles(...files: string[]): Promise<void> {
    for (const f of files) {
      try {
        await fs.promises.unlink(f);
      } catch {
        /* ignore */
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // YouTube 下载 — 支持 SSE 进度推送
  // ═══════════════════════════════════════════════════════════

  /** In-memory task store for YouTube downloads */
  private ytTasks = new Map<
    string,
    {
      status: 'fetching_info' | 'downloading' | 'converting' | 'done' | 'error';
      progress: number; // 0-100
      title: string;
      error?: string;
      tempFilePath?: string; // temp MP3 kept on disk until user triggers upload
      fileSize?: number;
      duration?: number;
      result?: {
        title: string;
        fileKey: string;
        fileUrl: string;
        fileSize: number;
        duration: number;
      };
    }
  >();

  /** Start a YouTube download task (returns taskId immediately) */
  startYoutubeDownload(url: string): { taskId: string } {
    // Decode HTML entities (browser may send &amp; instead of &)
    const cleanUrl = url.replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim();

    const taskId = uuidv4();
    this.ytTasks.set(taskId, {
      status: 'fetching_info',
      progress: 0,
      title: '',
    });

    // Run in background (don't await)
    this.runYoutubeDownload(taskId, cleanUrl).catch((err) => {
      this.logger.error(`YouTube task ${taskId} failed: ${err}`);
    });

    return { taskId };
  }

  /** Get current progress for a download task */
  getDownloadProgress(taskId: string) {
    const task = this.ytTasks.get(taskId);
    if (!task) return null;
    // Return progress without exposing tempFilePath
    return {
      status: task.status,
      progress: task.progress,
      title: task.title,
      error: task.error,
      fileSize: task.fileSize,
      duration: task.duration,
      result: task.result,
    };
  }

  /** Clean up a completed task from memory and its temp file */
  cleanupTask(taskId: string) {
    const task = this.ytTasks.get(taskId);
    if (task?.tempFilePath) {
      fs.promises.unlink(task.tempFilePath).catch(() => {});
    }
    this.ytTasks.delete(taskId);
  }

  /** Upload a completed download task's temp file to COS (deferred upload) */
  async uploadTaskToCos(taskId: string): Promise<{
    title: string;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    duration: number;
  }> {
    const task = this.ytTasks.get(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.status !== 'done' || !task.tempFilePath) {
      throw new BadRequestException('Task not ready for upload');
    }
    // If already uploaded, return cached result
    if (task.result) {
      return task.result;
    }

    const fileId = uuidv4();
    const cosKey = `music/${fileId}.mp3`;
    this.logger.log(
      `[${taskId}] Uploading to COS: ${cosKey} (${task.fileSize} bytes)`,
    );
    const { key, publicUrl } = await this.uploadFileToCos(
      task.tempFilePath,
      cosKey,
    );

    task.result = {
      title: task.title,
      fileKey: key,
      fileUrl: publicUrl,
      fileSize: task.fileSize ?? 0,
      duration: task.duration ?? 0,
    };

    // Clean up temp file after upload
    await this.cleanupFiles(task.tempFilePath);
    task.tempFilePath = undefined;

    this.logger.log(`[${taskId}] Upload complete!`);
    return task.result;
  }

  /** Upload to COS + save to DB in one atomic call */
  async uploadAndSaveTask(
    taskId: string,
    meta: {
      title?: string;
      musician: string;
      performer: string;
      category: string;
      series?: string;
    },
  ) {
    // Step 1: Upload to COS
    const uploaded = await this.uploadTaskToCos(taskId);

    // Step 2: Save to DB
    const title = meta.title || uploaded.title;
    const maxOrder = await this.prisma.musicTrack.aggregate({
      _max: { order: true },
    });
    const track = await this.prisma.musicTrack.create({
      data: {
        title,
        musician: meta.musician,
        performer: meta.performer,
        category: meta.category,
        series: meta.series,
        duration: uploaded.duration,
        fileKey: uploaded.fileKey,
        fileUrl: uploaded.fileUrl,
        fileSize: uploaded.fileSize,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    this.logger.log(`[${taskId}] Saved to DB: ${track.id} — ${title}`);

    // Cleanup server task
    this.cleanupTask(taskId);

    return track;
  }

  /** Background worker: download YouTube audio (NO COS upload) */
  private async runYoutubeDownload(taskId: string, url: string): Promise<void> {
    const task = this.ytTasks.get(taskId);
    if (!task) return;

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdl-'));
    const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

    try {
      // Check for cookies file (needed on servers where YouTube blocks by IP)
      // Copy to writable temp path since yt-dlp needs to write back updated cookies
      const cookiesSrc = this.getYoutubeCookiesPath();
      const cookiesStat = await fs.promises
        .stat(cookiesSrc)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
      if (cookiesStat?.isDirectory()) {
        throw new Error(
          `cookies.txt 当前是目录，请删除服务器上的 ${cookiesSrc} 目录后重试`,
        );
      }
      let cookiesArgs: string[] = [];
      if (cookiesStat?.isFile()) {
        const cookiesTmp = path.join(tmpDir, 'cookies.txt');
        await fs.promises.copyFile(cookiesSrc, cookiesTmp);
        cookiesArgs = ['--cookies', cookiesTmp];
      }
      const jsRuntimeArgs = [
        '--js-runtimes',
        'node',
        '--remote-components',
        'ejs:github',
      ];

      // Step 1: Get video info
      task.status = 'fetching_info';
      task.progress = 5;
      this.logger.log(`[${taskId}] Fetching info for: ${url}`);

      const { stdout: infoJson } = await execFileAsync(
        'yt-dlp',
        [
          ...cookiesArgs,
          ...jsRuntimeArgs,
          '--dump-json',
          '--no-download',
          '--no-playlist',
          url,
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
      );
      const info = JSON.parse(infoJson) as {
        title?: string;
        duration?: number;
      };
      const videoTitle = info.title || 'untitled';
      task.title = videoTitle;
      task.progress = 10;
      this.logger.log(`[${taskId}] Title: ${videoTitle}`);

      // Step 2: Download and convert to MP3
      task.status = 'downloading';
      task.progress = 15;
      this.logger.log(`[${taskId}] Starting download...`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('yt-dlp', [
          ...cookiesArgs,
          ...jsRuntimeArgs,
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '0',
          '--no-playlist',
          '--no-overwrites',
          '--newline',
          '--progress',
          '-o',
          outputTemplate,
          url,
        ]);

        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => {
          const line = data.toString();
          const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (match) {
            const dlPercent = parseFloat(match[1]);
            task.progress = Math.round(15 + (dlPercent / 100) * 65);
          }
          if (
            line.includes('[ExtractAudio]') ||
            line.includes('Post-process')
          ) {
            task.status = 'converting';
            task.progress = 85;
          }
        });

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number | null) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `yt-dlp exited with code ${code}: ${stderr.slice(-500)}`,
              ),
            );
        });

        proc.on('error', reject);

        setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error('Download timed out (10 min)'));
        }, 10 * 60_000);
      });

      // Step 3: Find the downloaded mp3 file
      task.progress = 90;
      const files = await fs.promises.readdir(tmpDir);
      const mp3File = files.find((f) => f.endsWith('.mp3'));
      if (!mp3File) {
        throw new Error('yt-dlp did not produce an MP3 file');
      }

      // Move to a stable temp path (so tmpDir can be cleaned up)
      const stablePath = path.join(os.tmpdir(), `ytdl-${taskId}.mp3`);
      await fs.promises.rename(path.join(tmpDir, mp3File), stablePath);

      // Step 4: Get duration and file size
      const [duration, fileSize] = await Promise.all([
        this.getAudioDuration(stablePath),
        this.getFileSize(stablePath),
      ]);

      // Done — file stays on disk, no COS upload yet
      task.status = 'done';
      task.progress = 100;
      task.tempFilePath = stablePath;
      task.fileSize = fileSize;
      task.duration = duration;
      this.logger.log(
        `[${taskId}] Download complete, temp: ${stablePath} (${fileSize} bytes)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Parse specific yt-dlp errors for user-friendly messages
      let userMessage = message;
      if (message.includes('Sign in to confirm')) {
        userMessage =
          '服务器被 YouTube 检测为 bot，需要上传 cookies.txt 到服务器';
      } else if (message.includes('No supported JavaScript runtime')) {
        userMessage = '服务器缺少 JS 运行时 (Deno)，请重新构建 API 镜像';
      }
      this.logger.error(`[${taskId}] Failed: ${message}`);
      task.status = 'error';
      task.error = userMessage;
    } finally {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private getYoutubeCookiesPath(): string {
    return (
      process.env.YOUTUBE_COOKIES_PATH ||
      path.join(process.cwd(), 'cookies.txt')
    );
  }

  async updateYoutubeCookies(cookies: string) {
    if (typeof cookies !== 'string') {
      throw new BadRequestException('请上传 cookies.txt 内容');
    }

    const normalized = cookies.replace(/\r\n/g, '\n').trimEnd() + '\n';

    if (normalized.length < 100) {
      throw new BadRequestException('cookies.txt 内容太短');
    }

    const hasCookieHeader = normalized.includes('# Netscape HTTP Cookie File');
    const hasYoutubeCookie =
      /(^|\n)([^#\n]*\.)?(youtube\.com|google\.com)\t/.test(normalized);
    if (!hasCookieHeader || !hasYoutubeCookie) {
      throw new BadRequestException(
        '请上传 Netscape 格式的 YouTube cookies.txt',
      );
    }

    const cookiesPath = this.getYoutubeCookiesPath();
    const cookiesDir = path.dirname(cookiesPath);
    await fs.promises.mkdir(cookiesDir, { recursive: true });

    const existing = await fs.promises
      .stat(cookiesPath)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
    if (existing?.isDirectory()) {
      throw new BadRequestException(
        `cookies.txt 当前是目录，请删除服务器上的 ${cookiesPath} 目录后重试`,
      );
    }

    const tempPath = path.join(
      cookiesDir,
      `.cookies.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      await fs.promises.writeFile(tempPath, normalized, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.promises.rename(tempPath, cookiesPath);
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => {});
      const code =
        error instanceof Error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (code === 'EISDIR') {
        throw new BadRequestException(
          `cookies.txt 当前是目录，请删除服务器上的 ${cookiesPath} 目录后重试`,
        );
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new BadRequestException(
          `没有权限写入 ${cookiesPath}，请检查 Docker volume 权限`,
        );
      }
      throw error;
    }

    return {
      ok: true,
      bytes: Buffer.byteLength(normalized, 'utf8'),
      updatedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 音乐分割
  // ═══════════════════════════════════════════════════════════

  /** Download a COS object to a local temp path */
  private async downloadFromCos(cosKey: string): Promise<string> {
    const tmpPath = path.join(
      os.tmpdir(),
      `cos-dl-${uuidv4()}${path.extname(cosKey) || '.mp3'}`,
    );

    await new Promise<void>((resolve, reject) => {
      this.cos.getObject(
        {
          Bucket: this.getBucket(),
          Region: this.getRegion(),
          Key: cosKey,
          Output: fs.createWriteStream(tmpPath),
        },
        (err: unknown) => {
          if (err) {
            reject(
              err instanceof Error
                ? err
                : new Error(
                    (err as { message?: string }).message ??
                      'COS download error',
                  ),
            );
          } else {
            resolve();
          }
        },
      );
    });

    return tmpPath;
  }

  /** 分割音乐文件为多个片段 */
  async splitTrack(
    trackId: string,
    segments: SplitSegmentDto[],
  ): Promise<
    Array<{
      title: string;
      fileKey: string;
      fileUrl: string;
      fileSize: number;
      duration: number;
    }>
  > {
    const track = await this.findOne(trackId);
    const tmpFiles: string[] = [];

    try {
      // Step 1: Download source file from COS
      this.logger.log(`Downloading source track: ${track.fileKey}`);
      const sourcePath = await this.downloadFromCos(track.fileKey);
      tmpFiles.push(sourcePath);

      // Step 2: Split all segments in parallel
      const segmentPromises = segments.map(async (segment) => {
        if (segment.startTime >= segment.endTime) {
          throw new BadRequestException(
            `Invalid segment "${segment.title}": startTime (${segment.startTime}) must be < endTime (${segment.endTime})`,
          );
        }

        const fileId = uuidv4();
        const outputPath = path.join(os.tmpdir(), `split-${fileId}.mp3`);
        tmpFiles.push(outputPath);

        this.logger.log(
          `Splitting segment "${segment.title}": ${segment.startTime}s - ${segment.endTime}s`,
        );

        // -ss BEFORE -i = input seeking (instant), -t = duration from seek point
        const duration = segment.endTime - segment.startTime;
        await execFileAsync('ffmpeg', [
          '-ss',
          String(segment.startTime),
          '-i',
          sourcePath,
          '-t',
          String(duration),
          '-c',
          'copy',
          '-y',
          outputPath,
        ]);

        const [segDuration, fileSize] = await Promise.all([
          this.getAudioDuration(outputPath),
          this.getFileSize(outputPath),
        ]);

        // Upload segment to COS
        const cosKey = `music/${fileId}.mp3`;
        const { key, publicUrl } = await this.uploadFileToCos(
          outputPath,
          cosKey,
        );

        return {
          title: segment.title,
          fileKey: key,
          fileUrl: publicUrl,
          fileSize,
          duration: segDuration,
        };
      });

      const results = await Promise.all(segmentPromises);

      return results;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Music split failed: ${message}`);
      throw new InternalServerErrorException(`音乐分割失败: ${message}`);
    } finally {
      await this.cleanupFiles(...tmpFiles);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 原有方法
  // ═══════════════════════════════════════════════════════════

  /** 生成 MP3 上传预签名 URL */
  async generateUploadUrl(fileName: string) {
    const fileId = uuidv4();
    const extension = fileName.split('.').pop() || 'mp3';
    const key = `music/${fileId}.${extension}`;

    const { Url: uploadUrl } = await this.getObjectUrlAsync({
      Bucket: this.getBucket(),
      Region: this.getRegion(),
      Key: key,
      Method: 'PUT',
      Sign: true,
      Expires: 3600,
      Headers: { 'Content-Type': 'audio/mpeg' },
    });

    const publicUrl = `${this.getPublicDomain()}/${key}`;

    return { uploadUrl, key, publicUrl };
  }

  /** 创建单条曲目 */
  async create(dto: CreateMusicTrackDto) {
    const maxOrder = await this.prisma.musicTrack.aggregate({
      _max: { order: true },
    });
    return this.prisma.musicTrack.create({
      data: {
        ...dto,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  /** 批量创建曲目 */
  async createBatch(dtos: CreateMusicTrackDto[]) {
    const maxOrder = await this.prisma.musicTrack.aggregate({
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;

    const results: Awaited<ReturnType<typeof this.prisma.musicTrack.create>>[] =
      [];
    for (const dto of dtos) {
      const track = await this.prisma.musicTrack.create({
        data: { ...dto, order: nextOrder++ },
      });
      results.push(track);
    }
    return results;
  }

  /** 检查曲目标题是否已存在 */
  async checkTitleExists(
    title: string,
  ): Promise<{ exists: boolean; id?: string }> {
    const track = await this.prisma.musicTrack.findFirst({
      where: { title },
    });
    return { exists: !!track, id: track?.id };
  }

  /** 获取曲目（分页 + 筛选） */
  async findAll(
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      category?: string;
      artist?: string;
      series?: string;
    } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (options.search) {
      where.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { musician: { contains: options.search, mode: 'insensitive' } },
        { performer: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    if (options.category && options.category !== 'all') {
      where.category = options.category;
    }

    if (options.artist) {
      where.musician = options.artist;
    }

    if (options.series) {
      where.series = options.series;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.musicTrack.findMany({
        where,
        orderBy: { order: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.musicTrack.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 获取单个曲目 */
  async findOne(id: string) {
    const track = await this.prisma.musicTrack.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Music track not found');
    return track;
  }

  /** 更新曲目元信息 */
  async update(id: string, dto: UpdateMusicTrackDto) {
    const existing = await this.findOne(id);

    // 如果文件 key 发生变化，删除旧的 COS 文件
    if (dto.fileKey && dto.fileKey !== existing.fileKey) {
      this.cos.deleteObject(
        {
          Bucket: this.getBucket(),
          Region: this.getRegion(),
          Key: existing.fileKey,
        },
        (err) => {
          if (err) this.logger.error('COS delete old file error:', err);
          else
            this.logger.log(
              `Deleted old COS file: ${existing.fileKey} (replaced by ${dto.fileKey})`,
            );
        },
      );
    }

    return this.prisma.musicTrack.update({
      where: { id },
      data: dto,
    });
  }

  /** 批量更新排序 */
  async reorder(ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.musicTrack.update({
        where: { id },
        data: { order: index },
      }),
    );
    return this.prisma.$transaction(updates);
  }

  /** 播放计数 +1 */
  async incrementPlayCount(id: string) {
    return this.prisma.musicTrack.update({
      where: { id },
      data: { playCount: { increment: 1 } },
    });
  }

  /** 删除曲目并从 COS 移除文件 */
  async remove(id: string) {
    const track = await this.findOne(id);

    // 从 COS 删除文件（异步，不阻塞）
    this.cos.deleteObject(
      {
        Bucket: this.getBucket(),
        Region: this.getRegion(),
        Key: track.fileKey,
      },
      (err) => {
        if (err) console.error('COS delete error:', err);
      },
    );

    return this.prisma.musicTrack.delete({ where: { id } });
  }

  /** 获取所有不重复的分类 */
  async getCategories() {
    const tracks = await this.prisma.musicTrack.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return tracks.map((t) => t.category);
  }

  /** 获取所有不重复的作曲家 */
  async getMusicians() {
    const tracks = await this.prisma.musicTrack.findMany({
      select: { musician: true },
      distinct: ['musician'],
      orderBy: { musician: 'asc' },
    });
    return tracks.map((t) => t.musician);
  }

  /** 获取各维度的歌曲数量 */
  async getCounts() {
    const [total, byCategory, byArtist, bySeries] =
      await this.prisma.$transaction([
        this.prisma.musicTrack.count(),
        this.prisma.musicTrack.groupBy({
          by: ['category'],
          orderBy: { category: 'asc' },
          _count: true,
        }),
        this.prisma.musicTrack.groupBy({
          by: ['musician'],
          orderBy: { musician: 'asc' },
          _count: true,
        }),
        this.prisma.musicTrack.groupBy({
          by: ['series'],
          orderBy: { series: 'asc' },
          _count: true,
          where: { series: { not: null } },
        }),
      ]);

    return { total, byCategory, byArtist, bySeries };
  }
}
