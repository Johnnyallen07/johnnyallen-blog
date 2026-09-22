import { MusicMetadataService } from './music-metadata.service';
import { ConfigService } from '@nestjs/config';

const source = {
  taskId: 'source-task',
  title: 'Bach Prelude BWV 846',
  channel: 'Piano Channel',
};
const suggestion = {
  taskId: source.taskId,
  title: 'Prelude BWV 846',
  musician: 'Johann Sebastian Bach',
  performer: 'Pianist',
  category: '古典',
  series: null,
  confidence: 0.9,
  reason: '来源明确',
  needsReview: [],
};
function setup(
  config: Record<string, string> = { DEEPSEEK_API_KEY: 'test-secret' },
) {
  const prisma = {
    musicTrack: { findMany: jest.fn().mockResolvedValue([]) },
    musicCategory: {
      findMany: jest.fn().mockResolvedValue([{ name: '古典' }]),
    },
    musicArtist: { findMany: jest.fn().mockResolvedValue([{ name: 'Bach' }]) },
    musicSeries: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new MusicMetadataService(
    prisma as never,
    { get: (key: string) => config[key] } as ConfigService,
  );
  return { service, prisma };
}
function completion(content: unknown, finish_reason = 'stop') {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason }] }),
    { status: 200 },
  );
}

describe('Music metadata DeepSeek integration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not use Gemini or translation credentials as music fallback', async () => {
    const { service, prisma } = setup({
      GEMINI_API_KEY: 'old-key',
      TRANSLATE_MODEL: 'gemini',
      TRANSLATE_API_KEY: 'old-key',
    });
    expect(service.getStatus().configured).toBe(false);
    await expect(service.suggest([source])).rejects.toThrow('DeepSeek');
    expect(prisma.musicTrack.findMany).not.toHaveBeenCalled();
  });

  it('uses the DeepSeek endpoint, JSON mode, bounded output and canonical library names', async () => {
    const { service } = setup();
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        completion(JSON.stringify({ suggestions: [suggestion] })),
      );
    const result = await service.suggest([source]);
    expect(result[0].musician).toBe('Bach');
    expect(request.mock.calls[0][0]).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    const body = JSON.parse(request.mock.calls[0][1]!.body as string) as {
      model: string;
      response_format: { type: string };
      thinking: { type: string };
      max_tokens: number;
    };
    expect(body.model).toBe('deepseek-flash');
    expect(body.response_format.type).toBe('json_object');
    expect(body.thinking.type).toBe('disabled');
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(JSON.stringify(service.getStatus())).not.toContain('test-secret');
  });

  it('retries empty JSON-mode output once and does not silently show a blank suggestion as success', async () => {
    const request = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(completion('')));
    await expect(setup().service.suggest([source])).rejects.toThrow('内容为空');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([null, { taskId: 'wrong-task' }])(
    'rejects missing or wrong task entries: %s',
    async (entry) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          completion(JSON.stringify({ suggestions: [entry] })),
        );
      await expect(setup().service.suggest([source])).rejects.toThrow(
        '任务标识不匹配',
      );
    },
  );

  it('reports API authentication errors clearly without exposing upstream credentials', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'test-secret is invalid' } }),
          { status: 401 },
        ),
      );
    await expect(setup().service.suggest([source])).rejects.toThrow(
      'DeepSeek API 密钥无效',
    );
  });

  it('distinguishes a proxy HTML error from malformed AI JSON', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('<html>Bad gateway</html>', { status: 502 }),
      );
    await expect(setup().service.suggest([source])).rejects.toThrow(
      '非 JSON 响应',
    );
  });

  it('reports truncation instead of parsing partial JSON', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(completion('{"suggestions":', 'length'));
    await expect(setup().service.suggest([source])).rejects.toThrow('被截断');
  });

  it('keeps network failures actionable without changing library data', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));
    await expect(setup().service.suggest([source])).rejects.toThrow(
      '网络不可用',
    );
  });
});
