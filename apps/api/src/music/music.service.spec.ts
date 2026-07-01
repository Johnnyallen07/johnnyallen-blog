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
    const service = new MusicService({} as never);

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
    const service = new MusicService({} as never);

    await expect(service.updateYoutubeCookies(VALID_COOKIES)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updateYoutubeCookies(VALID_COOKIES)).rejects.toThrow(
      'cookies.txt 当前是目录',
    );
  });
});
