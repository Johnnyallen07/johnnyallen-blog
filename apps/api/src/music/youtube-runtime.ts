import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/** Called inside the download queue so pip never mutates a running extractor. */
export class YoutubeRuntime {
  constructor(private readonly execute: typeof run = run) {}
  private checkedAt = 0;
  private issue: string | undefined;

  async refresh(force = false) {
    const python = process.env.YTDLP_PYTHON;
    if (python && (force || Date.now() - this.checkedAt > 24 * 60 * 60_000)) {
      this.checkedAt = Date.now();
      try {
        await this.execute(
          python,
          [
            '-m',
            'pip',
            'install',
            '--disable-pip-version-check',
            '--no-cache-dir',
            '--upgrade',
            'yt-dlp[default]',
          ],
          { timeout: 90_000, maxBuffer: 1024 * 1024 },
        );
        this.issue = undefined;
      } catch {
        this.issue =
          '下载器更新失败，继续尝试已安装版本；请检查服务器到 PyPI 的网络连接。';
      }
    }
    return this.status();
  }

  async status() {
    const version = await this.execute('yt-dlp', ['--version'], {
      timeout: 10_000,
    })
      .then(({ stdout }) => stdout.trim())
      .catch(() => null);
    return {
      version,
      autoUpdate: Boolean(process.env.YTDLP_PYTHON),
      checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
      issue: this.issue,
    };
  }
}
