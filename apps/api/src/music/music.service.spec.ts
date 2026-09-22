import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MusicService } from './music.service';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

const VALID_COOKIES = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1817412473	SID	abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz
`;

describe('MusicService YouTube cookies', () => {
  let tempDir: string;
  let originalCookiesPath: string | undefined;

  beforeEach(async () => {
    originalCookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yt-cookies-'));
  });

  afterEach(async () => {
    if (originalCookiesPath === undefined) {
      delete process.env.YOUTUBE_COOKIES_PATH;
    } else {
      process.env.YOUTUBE_COOKIES_PATH = originalCookiesPath;
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('creates the cookies directory before writing cookies.txt', async () => {
    const cookiesPath = path.join(tempDir, 'data', 'youtube', 'cookies.txt');
    process.env.YOUTUBE_COOKIES_PATH = cookiesPath;
    const service = new MusicService({} as never, {} as never, {} as never);

    const result = await service.updateYoutubeCookies(VALID_COOKIES);

    await expect(fs.promises.readFile(cookiesPath, 'utf8')).resolves.toBe(
      VALID_COOKIES,
    );
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(Buffer.byteLength(VALID_COOKIES, 'utf8'));
  });

  it('returns a clear error when cookies.txt is a directory', async () => {
    const cookiesPath = path.join(tempDir, 'cookies.txt');
    await fs.promises.mkdir(cookiesPath);
    process.env.YOUTUBE_COOKIES_PATH = cookiesPath;
    const service = new MusicService({} as never, {} as never, {} as never);

    await expect(service.updateYoutubeCookies(VALID_COOKIES)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updateYoutubeCookies(VALID_COOKIES)).rejects.toThrow(
      'cookies.txt 当前是目录',
    );
  });
});

describe('YouTube task lifecycle', () => {
  const uploaded = {
    title: 'Source',
    fileKey: 'music/test.mp3',
    fileUrl: 'https://example.test/test.mp3',
    fileSize: 1000,
    duration: 12,
  };
  const metadata = {
    title: 'Reviewed',
    musician: 'Bach',
    performer: 'Pianist',
    category: 'Classical',
  };
  const track = { id: 'track', ...metadata, ...uploaded };
  const createService = () => {
    const prisma = {
      musicTrack: {
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 0 } }),
        upsert: jest.fn().mockResolvedValue(track),
      },
    };
    const service = new MusicService(prisma as never, {} as never, {} as never);
    service['ytTasks'].set('task', {
      status: 'done',
      progress: 100,
      title: 'Source',
      expiresAt: Date.now() + 60_000,
    });
    return { service, prisma };
  };

  it.each([
    'https://example.com/a',
    'http://127.0.0.1/a',
    'https://youtube.com.evil.test/watch?v=jNQXAC9IVRw',
    'https://www.youtube.com/playlist?list=test',
    'https://user@youtube.com/watch?v=jNQXAC9IVRw',
  ])('rejects unsupported URL %s before launching a worker', (url) => {
    const { service } = createService();
    expect(() => service.startYoutubeDownload(url)).toThrow(
      BadRequestException,
    );
  });

  it('normalizes a mobile URL to a single video and ignores playlist parameters', async () => {
    const { service } = createService();
    const worker = jest
      .spyOn(
        service as unknown as {
          runYoutubeDownload: (id: string, url: string) => Promise<void>;
        },
        'runYoutubeDownload',
      )
      .mockResolvedValue();
    jest.spyOn(service['youtubeRuntime'], 'refresh').mockResolvedValue({
      version: 'test',
      autoUpdate: false,
      checkedAt: null,
      issue: undefined,
    });
    service.startYoutubeDownload(
      'https://m.youtube.com/watch?v=jNQXAC9IVRw&amp;list=anything',
    );
    await service['youtubeQueue'];
    expect(worker).toHaveBeenCalledWith(
      'test-uuid',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    );
  });

  it('coalesces concurrent saves and returns the same receipt after response loss', async () => {
    const { service, prisma } = createService();
    const upload = jest
      .spyOn(service, 'uploadTaskToCos')
      .mockResolvedValue(uploaded);
    const [first, second] = await Promise.all([
      service.uploadAndSaveTask('task', metadata),
      service.uploadAndSaveTask('task', metadata),
    ]);
    expect(first).toEqual(second);
    expect(await service.uploadAndSaveTask('task', metadata)).toEqual(first);
    expect(prisma.musicTrack.upsert).toHaveBeenCalledTimes(1);
    expect(
      (prisma.musicTrack.upsert.mock.calls as unknown[][])[0]?.[0],
    ).toMatchObject({
      where: { id: 'task' },
      update: {},
      create: { id: 'task', title: 'Reviewed' },
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(service.getDownloadProgress('task')?.savedTrack).toEqual(first);
  });

  it('allows a DB save to be retried without losing the uploaded audio', async () => {
    const { service, prisma } = createService();
    service['ytTasks'].get('task')!.result = uploaded;
    prisma.musicTrack.upsert.mockRejectedValueOnce(new Error('DB offline'));
    await expect(service.uploadAndSaveTask('task', metadata)).rejects.toThrow(
      'DB offline',
    );
    expect(await service.uploadAndSaveTask('task', metadata)).toEqual(track);
    expect(prisma.musicTrack.upsert).toHaveBeenCalledTimes(2);
  });

  it('recovers a successful save after process restart', async () => {
    const prisma = {
      musicTrack: { findUnique: jest.fn().mockResolvedValue(track) },
    };
    const service = new MusicService(prisma as never, {} as never, {} as never);
    expect(await service.uploadAndSaveTask('task', metadata)).toEqual(track);
    expect((await service.getSavedYoutubeTask('task'))?.savedTrack).toEqual(
      track,
    );
  });

  it('does not delete a task while it is downloading', () => {
    const { service } = createService();
    service['ytTasks'].get('task')!.status = 'downloading';
    expect(() => service.cleanupTask('task')).toThrow(BadRequestException);
    expect(service.getDownloadProgress('task')).not.toBeNull();
  });

  it('expires finished tasks and rejects preview of missing audio', () => {
    const { service } = createService();
    service['ytTasks'].get('task')!.expiresAt = 0;
    expect(service.getDownloadProgress('task')).toBeNull();
    expect(() => service.getYoutubePreviewPath('task')).toThrow();
  });

  it('validates all clip ranges before downloading or starting ffmpeg', async () => {
    const { service } = createService();
    jest.spyOn(service, 'findOne').mockResolvedValue({ duration: 12 } as never);
    await expect(
      service.splitTrack('track', [
        { title: 'Clip', startTime: -1, endTime: 10 },
      ]),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.splitTrack('track', [
        { title: 'Clip', startTime: 0, endTime: 13 },
      ]),
    ).rejects.toThrow(BadRequestException);
    await expect(service.splitTrack('track', [])).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('Cookie refresh concurrency', () => {
  let directory: string;
  const previousPath = process.env.YOUTUBE_COOKIES_PATH;
  beforeEach(async () => {
    directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'yt-refresh-'),
    );
    process.env.YOUTUBE_COOKIES_PATH = path.join(directory, 'cookies.txt');
  });
  afterEach(async () => {
    if (previousPath === undefined) delete process.env.YOUTUBE_COOKIES_PATH;
    else process.env.YOUTUBE_COOKIES_PATH = previousPath;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  it('never overwrites a newly synchronized browser session with an old download snapshot', async () => {
    const service = new MusicService({} as never, {} as never, {} as never);
    const newer = VALID_COOKIES.replace('SID', 'NEW_SESSION');
    await service.updateYoutubeCookies(VALID_COOKIES);
    await service.updateYoutubeCookies(newer);
    await service['persistYoutubeCookies'](
      VALID_COOKIES.replace('SID', 'ROTATED'),
      VALID_COOKIES,
    );
    expect(
      await fs.promises.readFile(process.env.YOUTUBE_COOKIES_PATH!, 'utf8'),
    ).toBe(newer);
    expect(
      (await fs.promises.stat(process.env.YOUTUBE_COOKIES_PATH!)).mode & 0o777,
    ).toBe(0o600);
  });

  it('persists downloader cookie rotation when the browser session has not changed', async () => {
    const service = new MusicService({} as never, {} as never, {} as never);
    const rotated = VALID_COOKIES.replace('SID', 'ROTATED');
    await service.updateYoutubeCookies(VALID_COOKIES);
    await service['persistYoutubeCookies'](rotated, VALID_COOKIES);
    expect(
      await fs.promises.readFile(process.env.YOUTUBE_COOKIES_PATH!, 'utf8'),
    ).toBe(rotated);
  });

  it('rejects invalid cookie expiry and unrelated domains without changing the existing file', async () => {
    const service = new MusicService({} as never, {} as never, {} as never);
    await service.updateYoutubeCookies(VALID_COOKIES);
    await expect(
      service.updateYoutubeCookies(VALID_COOKIES.replace('1817412473', 'NaN')),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateYoutubeCookies(
        VALID_COOKIES.replace('.youtube.com', '.youtube.com.evil.test'),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(
      await fs.promises.readFile(process.env.YOUTUBE_COOKIES_PATH!, 'utf8'),
    ).toBe(VALID_COOKIES);
  });
});

describe('YouTube metadata request lifecycle', () => {
  const suggestion = {
    taskId: 'task',
    title: 'Bach Prelude',
    musician: 'Bach',
    performer: 'Pianist',
    category: '古典',
    series: null,
    confidence: 0.9,
    reason: '来源明确',
    needsReview: [],
  };
  function setup() {
    const ai = { suggest: jest.fn().mockResolvedValue([suggestion]) };
    const service = new MusicService({} as never, {} as never, ai as never);
    service['ytTasks'].set('task', {
      status: 'done',
      progress: 100,
      title: 'Retained editable title',
      expiresAt: Date.now() + 60_000,
    });
    return { service, ai };
  }

  it('waits for actual source metadata even if a retained title exists', async () => {
    const { service, ai } = setup();
    expect(service.getDownloadProgress('task')?.sourceReady).toBe(false);
    await expect(service.suggestYoutubeMetadata(['task'])).rejects.toThrow(
      '来源信息尚未取得',
    );
    expect(ai.suggest).not.toHaveBeenCalled();
    service['ytTasks'].get('task')!.sourceMetadata = {
      title: 'Original YouTube title',
    };
    expect(service.getDownloadProgress('task')?.sourceReady).toBe(true);
    await service.suggestYoutubeMetadata(['task']);
    expect(ai.suggest).toHaveBeenCalledWith([
      { taskId: 'task', title: 'Original YouTube title' },
    ]);
  });

  it('coalesces concurrent requests, caches successful results and allows explicit regeneration', async () => {
    const { service, ai } = setup();
    service['ytTasks'].get('task')!.sourceMetadata = { title: 'Original' };
    const [first, second] = await Promise.all([
      service.suggestYoutubeMetadata(['task']),
      service.suggestYoutubeMetadata(['task']),
    ]);
    expect(first).toEqual(second);
    await service.suggestYoutubeMetadata(['task']);
    expect(ai.suggest).toHaveBeenCalledTimes(1);
    await service.suggestYoutubeMetadata(['task'], true);
    expect(ai.suggest).toHaveBeenCalledTimes(2);
    service.cleanupTask('task');
    expect(service['metadataCache'].has('task')).toBe(false);
  });

  it('clears failed in-flight requests so retry can succeed', async () => {
    const { service, ai } = setup();
    service['ytTasks'].get('task')!.sourceMetadata = { title: 'Original' };
    ai.suggest.mockRejectedValueOnce(new Error('DeepSeek unavailable'));
    await expect(service.suggestYoutubeMetadata(['task'])).rejects.toThrow(
      'unavailable',
    );
    await expect(service.suggestYoutubeMetadata(['task'])).resolves.toEqual({
      suggestions: [suggestion],
    });
    expect(ai.suggest).toHaveBeenCalledTimes(2);
  });
});
