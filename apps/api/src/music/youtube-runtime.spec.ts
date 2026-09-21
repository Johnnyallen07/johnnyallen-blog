import { YoutubeRuntime } from './youtube-runtime';

describe('YouTube runtime maintenance', () => {
  const previous = process.env.YTDLP_PYTHON;
  afterEach(() => {
    if (previous === undefined) delete process.env.YTDLP_PYTHON;
    else process.env.YTDLP_PYTHON = previous;
  });
  it('checks once per day, updates matching EJS dependencies and allows forced refresh', async () => {
    process.env.YTDLP_PYTHON = '/venv/python';
    const execute = jest.fn().mockResolvedValue({ stdout: '2026.test\n' });
    const runtime = new YoutubeRuntime(execute);
    await runtime.refresh();
    await runtime.refresh();
    expect(
      execute.mock.calls.filter(([command]) => command === '/venv/python'),
    ).toHaveLength(1);
    expect((execute.mock.calls as unknown[][])[0]?.[1]).toContain(
      'yt-dlp[default]',
    );
    await runtime.refresh(true);
    expect(
      execute.mock.calls.filter(([command]) => command === '/venv/python'),
    ).toHaveLength(2);
    expect((await runtime.status()).version).toBe('2026.test');
  });
  it('reports update failure while preserving the installed downloader for the next attempt', async () => {
    process.env.YTDLP_PYTHON = '/venv/python';
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error('PyPI unavailable'))
      .mockResolvedValue({ stdout: 'installed-version' });
    const runtime = new YoutubeRuntime(execute);
    const status = await runtime.refresh();
    expect(status.version).toBe('installed-version');
    expect(status.issue).toContain('下载器更新失败');
    await runtime.refresh(true);
    expect((await runtime.status()).issue).toBeUndefined();
  });
  it('does not mutate a system-managed local installation', async () => {
    delete process.env.YTDLP_PYTHON;
    const execute = jest.fn().mockResolvedValue({ stdout: 'local-version' });
    await new YoutubeRuntime(execute).refresh(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((execute.mock.calls as unknown[][])[0]?.[0]).toBe('yt-dlp');
  });
});
