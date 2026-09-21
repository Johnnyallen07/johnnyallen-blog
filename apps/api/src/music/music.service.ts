import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { MusicTrack } from '@prisma/client';
import { YoutubeRuntime } from './youtube-runtime';
import { SaveYoutubeDto } from './dto/save-youtube.dto';
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
import { I18nService } from '../i18n/i18n.service';
import {
  MusicMetadataService,
  YoutubeSourceMetadata,
} from './music-metadata.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class MusicService implements OnModuleInit, OnModuleDestroy {
  private taskCleanupTimer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.taskCleanupTimer = setInterval(() => this.expireTasks(), 60_000);
    this.taskCleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.taskCleanupTimer);
  }
  private cos: COS;
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    private musicMetadata: MusicMetadataService,
  ) {
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
    const { size } = await fs.promises.stat(localPath);

    await new Promise<void>((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: this.getBucket(),
          Region: this.getRegion(),
          Key: cosKey,
          Body: fs.createReadStream(localPath),
          ContentLength: size,
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
      status:
        | 'queued'
        | 'fetching_info'
        | 'downloading'
        | 'converting'
        | 'done'
        | 'error';
      expiresAt: number;
      savedTrack?: MusicTrack;
      progress: number; // 0-100
      title: string;
      error?: string;
      tempFilePath?: string; // temp MP3 kept on disk until user triggers upload
      fileSize?: number;
      duration?: number;
      sourceMetadata?: Omit<YoutubeSourceMetadata, 'taskId'>;
      result?: {
        title: string;
        fileKey: string;
        fileUrl: string;
        fileSize: number;
        duration: number;
      };
    }
  >();

  private readonly youtubeRuntime = new YoutubeRuntime();
  private youtubeQueue: Promise<unknown> = Promise.resolve();
  private runtimeUpdate: Promise<unknown> | undefined;
  private cookieWrites: Promise<unknown> = Promise.resolve();
  private savingTasks = new Map<string, Promise<MusicTrack>>();
  private uploadingTasks = new Map<
    string,
    ReturnType<MusicService['performTaskUpload']>
  >();

  async getYoutubeRuntimeStatus() {
    return {
      ...(await this.youtubeRuntime.status()),
      updating: Boolean(this.runtimeUpdate),
    };
  }

  updateYoutubeRuntime() {
    if (!this.runtimeUpdate) {
      const update = this.youtubeQueue.then(() =>
        this.youtubeRuntime.refresh(true),
      );
      this.runtimeUpdate = update
        .catch(() => undefined)
        .finally(() => {
          this.runtimeUpdate = undefined;
        });
      this.youtubeQueue = this.runtimeUpdate;
    }
    return { queued: true };
  }

  private expireTasks() {
    for (const [id, task] of this.ytTasks) {
      if (
        task.expiresAt < Date.now() &&
        ['done', 'error'].includes(task.status) &&
        !this.savingTasks.has(id) &&
        !this.uploadingTasks.has(id)
      )
        this.cleanupTask(id);
    }
  }

  /** Start a YouTube download task (returns taskId immediately) */
  startYoutubeDownload(url: string): { taskId: string } {
    // Decode HTML entities (browser may send &amp; instead of &)
    const cleanUrl = url.replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim();

    let parsed: URL;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      throw new BadRequestException('请输入有效的 YouTube 视频链接');
    }
    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      ![
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ].includes(parsed.hostname)
    ) {
      throw new BadRequestException('只支持 YouTube 视频链接');
    }
    const videoId =
      parsed.hostname === 'youtu.be'
        ? parsed.pathname.slice(1)
        : parsed.pathname === '/watch'
          ? parsed.searchParams.get('v')
          : /^\/(shorts|live|embed)\/([^/]+)$/.exec(parsed.pathname)?.[2];
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId))
      throw new BadRequestException('请输入单个视频链接，不支持播放列表');
    this.expireTasks();
    if (
      [...this.ytTasks.values()].filter(
        (task) => !['done', 'error'].includes(task.status),
      ).length >= 20
    ) {
      throw new BadRequestException('下载队列已满，请稍后重试');
    }
    const taskId = uuidv4();
    this.ytTasks.set(taskId, {
      status: 'queued',
      expiresAt: Date.now() + 24 * 60 * 60_000,
      progress: 0,
      title: '',
    });

    // Run in background (don't await)
    this.youtubeQueue = this.youtubeQueue
      .then(async () => {
        await this.youtubeRuntime.refresh();
        await this.runYoutubeDownload(
          taskId,
          `https://www.youtube.com/watch?v=${videoId}`,
        );
      })
      .catch((err) => {
        this.logger.error(`YouTube task ${taskId} failed: ${err}`);
        const task = this.ytTasks.get(taskId);
        if (task) {
          task.status = 'error';
          task.error = '下载器初始化失败，请更新下载器后重试';
        }
      });

    return { taskId };
  }

  /** Get current progress for a download task */
  getDownloadProgress(taskId: string) {
    this.expireTasks();
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
      savedTrack: task.savedTrack,
    };
  }

  async getSavedYoutubeTask(taskId: string) {
    const savedTrack = await this.prisma.musicTrack.findUnique({
      where: { id: taskId },
    });
    return savedTrack
      ? { status: 'done', progress: 100, title: savedTrack.title, savedTrack }
      : null;
  }

  getYoutubePreviewPath(taskId: string) {
    this.expireTasks();
    const task = this.ytTasks.get(taskId);
    if (!task?.tempFilePath || task.status !== 'done')
      throw new NotFoundException('试听文件已过期，请重新下载');
    return task.tempFilePath;
  }

  /** 用当前音乐库和固定作曲家词表检索上下文，再让 AI 生成待审核信息。 */
  async suggestYoutubeMetadata(taskIds: string[]) {
    const sources = taskIds.map((taskId) => {
      const task = this.ytTasks.get(taskId);
      if (!task) throw new NotFoundException(`Task not found: ${taskId}`);
      if (!task.title) {
        throw new BadRequestException(`Task 尚未取得视频信息: ${taskId}`);
      }
      return {
        taskId,
        title: task.title,
        description: task.sourceMetadata?.description,
        uploader: task.sourceMetadata?.uploader,
        channel: task.sourceMetadata?.channel,
        tags: task.sourceMetadata?.tags,
        duration: task.duration || task.sourceMetadata?.duration,
      };
    });

    return { suggestions: await this.musicMetadata.suggest(sources) };
  }

  /** Clean up a completed task from memory and its temp file */
  cleanupTask(taskId: string) {
    const task = this.ytTasks.get(taskId);
    if (
      task &&
      (!['done', 'error'].includes(task.status) ||
        this.savingTasks.has(taskId) ||
        this.uploadingTasks.has(taskId))
    ) {
      throw new BadRequestException('任务仍在处理中，请完成后再移除');
    }
    if (task?.tempFilePath) {
      fs.promises.unlink(task.tempFilePath).catch(() => {});
    }
    this.ytTasks.delete(taskId);
  }

  /** Upload a completed download task's temp file to COS (deferred upload) */
  uploadTaskToCos(taskId: string) {
    const existing = this.uploadingTasks.get(taskId);
    if (existing) return existing;
    const operation = this.performTaskUpload(taskId).finally(() =>
      this.uploadingTasks.delete(taskId),
    );
    this.uploadingTasks.set(taskId, operation);
    return operation;
  }

  private async performTaskUpload(taskId: string): Promise<{
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
    // If already uploaded, return cached result
    if (task.result) {
      return task.result;
    }
    if (task.status !== 'done' || !task.tempFilePath) {
      throw new BadRequestException('Task not ready for upload');
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

  /** Coalesce double-clicks and retain successful results for safe retries. */
  async uploadAndSaveTask(taskId: string, meta: SaveYoutubeDto) {
    const task = this.ytTasks.get(taskId);
    if (!task) {
      const saved = await this.prisma.musicTrack.findUnique({
        where: { id: taskId },
      });
      if (saved) return saved;
      throw new NotFoundException('任务已过期或服务已重启，请重新下载');
    }
    if (task.savedTrack) return task.savedTrack;
    const existing = this.savingTasks.get(taskId);
    if (existing) return existing;
    const operation = this.performTaskSave(taskId, meta)
      .then((track) => {
        task.savedTrack = track;
        return track;
      })
      .finally(() => this.savingTasks.delete(taskId));
    this.savingTasks.set(taskId, operation);
    return operation;
  }

  private async performTaskSave(taskId: string, meta: SaveYoutubeDto) {
    // Step 1: Upload to COS
    const uploaded = await this.uploadTaskToCos(taskId);

    // Step 2: Save to DB
    const title = meta.title || uploaded.title;
    const maxOrder = await this.prisma.musicTrack.aggregate({
      _max: { order: true },
    });
    const track = await this.prisma.musicTrack.upsert({
      where: { id: taskId },
      update: {},
      create: {
        id: taskId,
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

    // Retain the receipt until task expiry so a lost HTTP response can be retried.

    return track;
  }

  /** Background worker: download YouTube audio (NO COS upload) */
  private async runYoutubeDownload(taskId: string, url: string): Promise<void> {
    const task = this.ytTasks.get(taskId);
    if (!task) return;

    let tmpDir: string | undefined;
    try {
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdl-'));
      const outputTemplate = path.join(tmpDir, 'audio.%(ext)s');
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
      let originalCookies: string | undefined;
      if (cookiesStat?.isFile()) {
        const cookiesTmp = path.join(tmpDir, 'cookies.txt');
        originalCookies = await fs.promises.readFile(cookiesSrc, 'utf8');
        await fs.promises.writeFile(cookiesTmp, originalCookies, {
          mode: 0o600,
        });
        cookiesArgs = ['--cookies', cookiesTmp];
      }
      const jsRuntimeArgs = [
        '--ignore-config',
        '--js-runtimes',
        'node',
        '--socket-timeout',
        '30',
        '--retries',
        '3',
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
        description?: string;
        uploader?: string;
        channel?: string;
        tags?: string[];
        is_live?: boolean;
      };
      if (info.is_live) throw new Error('直播尚未结束，请使用已发布的视频链接');
      const videoTitle = info.title || 'untitled';
      task.title = videoTitle;
      task.sourceMetadata = {
        title: videoTitle,
        duration: info.duration,
        description: info.description,
        uploader: info.uploader,
        channel: info.channel,
        tags: Array.isArray(info.tags)
          ? info.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      };
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
          '-f',
          'bestaudio/best',
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
          stderr = (stderr + data.toString()).slice(-4000);
        });

        proc.on('close', (code: number | null) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `yt-dlp exited with code ${code}: ${stderr.slice(-500)}`,
              ),
            );
        });

        proc.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
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
      task.tempFilePath = stablePath;

      // Step 4: Get duration and file size
      const [duration, fileSize] = await Promise.all([
        this.getAudioDuration(stablePath),
        this.getFileSize(stablePath),
      ]);

      if (!fileSize || !duration) {
        await this.cleanupFiles(stablePath);
        throw new Error('下载文件为空或不是可播放音频，请重试');
      }
      if (originalCookies) {
        const rotated = await fs.promises.readFile(
          path.join(tmpDir, 'cookies.txt'),
          'utf8',
        );
        await this.persistYoutubeCookies(rotated, originalCookies).catch(() =>
          this.logger.warn('Could not persist refreshed YouTube cookies'),
        );
      }

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
          'YouTube 要求验证浏览器会话，请点击「从浏览器同步」后重试；若仍失败，请在 YouTube 完成验证，并检查服务器出口 IP。';
      } else if (message.includes('No supported JavaScript runtime')) {
        userMessage =
          '服务器 JS 运行时不受支持，请使用 Node 22 及以上版本重新构建 API 镜像';
      }
      if (message.includes('403'))
        userMessage =
          'YouTube 拒绝下载：请更新下载器并同步 Cookie 后重试；仍失败时需检查出口 IP 或 PO Token 配置。';
      this.logger.error(`[${taskId}] YouTube download failed`);
      if (task.tempFilePath) await this.cleanupFiles(task.tempFilePath);
      task.tempFilePath = undefined;
      task.status = 'error';
      task.error = userMessage;
    } finally {
      try {
        if (tmpDir)
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

  async getYoutubeCookiesStatus() {
    const cookiesPath = this.getYoutubeCookiesPath();
    const stat = await fs.promises
      .stat(cookiesPath)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });

    if (!stat) return { configured: false };
    if (!stat.isFile()) {
      return {
        configured: false,
        issue: 'cookies.txt 当前不是文件',
      };
    }

    const content = await fs.promises.readFile(cookiesPath, 'utf8');
    const summary = this.summarizeYoutubeCookies(content);
    return {
      configured: summary.youtubeCookies > 0,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
      ...summary,
    };
  }

  updateYoutubeCookies(cookies: string) {
    return this.persistYoutubeCookies(cookies);
  }

  private persistYoutubeCookies(cookies: string, expected?: string) {
    const write = this.cookieWrites.then(async () => {
      if (expected !== undefined) {
        const current = await fs.promises
          .readFile(this.getYoutubeCookiesPath(), 'utf8')
          .catch(() => null);
        if (current !== expected)
          return { ok: true, ...(await this.getYoutubeCookiesStatus()) };
      }
      return this.writeYoutubeCookies(cookies);
    });
    this.cookieWrites = write.catch(() => undefined);
    return write;
  }

  private async writeYoutubeCookies(cookies: string) {
    if (typeof cookies !== 'string') {
      throw new BadRequestException('请上传 cookies.txt 内容');
    }

    if (Buffer.byteLength(cookies) > 1024 * 1024)
      throw new BadRequestException('Cookie 文件不能超过 1 MB');
    const normalized = cookies.replace(/\r\n/g, '\n').trimEnd() + '\n';

    if (normalized.length < 30) {
      throw new BadRequestException('cookies.txt 内容太短');
    }

    const hasCookieHeader = normalized.includes('# Netscape HTTP Cookie File');
    const cookieSummary = this.summarizeYoutubeCookies(normalized);
    if (!hasCookieHeader || cookieSummary.youtubeCookies === 0) {
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

    return { ok: true, ...(await this.getYoutubeCookiesStatus()) };
  }

  private summarizeYoutubeCookies(content: string) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    let totalCookies = 0;
    let youtubeCookies = 0;
    let activeYoutubeCookies = 0;
    let latestYoutubeExpiry = 0;
    const domains = new Set<string>();

    for (const line of content.split(/\r?\n/)) {
      if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
        continue;
      }
      const fields = line.replace(/^#HttpOnly_/, '').split('\t');
      if (fields.length < 7) continue;
      totalCookies += 1;
      const domain = fields[0]?.replace(/^\./, '') || '';
      const expires = Number(fields[4] || 0);
      if (!Number.isFinite(expires) || expires < 0 || expires > 253402300799)
        continue;
      const isYoutube =
        domain === 'youtube.com' ||
        domain.endsWith('.youtube.com') ||
        domain === 'google.com' ||
        domain.endsWith('.google.com');
      if (!isYoutube) continue;
      youtubeCookies += 1;
      domains.add(domain);
      if (!expires || expires > nowSeconds) activeYoutubeCookies += 1;
      if (expires > latestYoutubeExpiry) latestYoutubeExpiry = expires;
    }

    return {
      totalCookies,
      youtubeCookies,
      activeYoutubeCookies,
      domains: [...domains].sort(),
      expiresAt: latestYoutubeExpiry
        ? new Date(latestYoutubeExpiry * 1000).toISOString()
        : null,
      likelyExpired: youtubeCookies > 0 && activeYoutubeCookies === 0,
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
    if (
      !segments.length ||
      segments.length > 50 ||
      segments.some(
        (segment) =>
          !segment.title.trim() ||
          !Number.isFinite(segment.startTime) ||
          !Number.isFinite(segment.endTime) ||
          segment.startTime < 0 ||
          segment.startTime >= segment.endTime ||
          segment.endTime > track.duration,
      )
    ) {
      throw new BadRequestException(
        '片段标题不能为空，时间范围必须在音频时长内，最多 50 个片段',
      );
    }
    const tmpFiles: string[] = [];

    try {
      // Step 1: Download source file from COS
      this.logger.log(`Downloading source track: ${track.fileKey}`);
      const sourcePath = await this.downloadFromCos(track.fileKey);
      tmpFiles.push(sourcePath);

      // Bound CPU/memory and finish each worker before cleaning its input.
      const results: Array<{
        title: string;
        fileKey: string;
        fileUrl: string;
        fileSize: number;
        duration: number;
      }> = [];
      for (const segment of segments) {
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
          '-c:a',
          'libmp3lame',
          '-q:a',
          '2',
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

        results.push({
          title: segment.title,
          fileKey: key,
          fileUrl: publicUrl,
          fileSize,
          duration: segDuration,
        });
      }

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
      locale?: string;
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

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.musicTrack.findMany({
        where,
        orderBy: { order: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.musicTrack.count({ where }),
    ]);

    // 注意：category/series 是筛选键（保持中文规范值），只翻译展示字段
    const data = await this.i18n.localize('musicTrack', rows, options.locale);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 获取单个曲目 */
  async findOne(id: string, locale?: string) {
    const track = await this.prisma.musicTrack.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Music track not found');
    return this.i18n.localizeOne('musicTrack', track, locale);
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
