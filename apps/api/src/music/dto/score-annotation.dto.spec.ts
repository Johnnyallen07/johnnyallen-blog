import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMusicScoreDto } from './update-music-score.dto';

const stroke = {
  tool: 'pen',
  color: '#dc2626',
  width: 0.003,
  points: [{ x: 0.2, y: 0.4 }],
};

describe('score annotation validation', () => {
  it('accepts normalized drawing data and an empty array to clear annotations', async () => {
    for (const annotations of [[], [{ page: 'pdf:1', strokes: [stroke] }]]) {
      expect(
        await validate(plainToInstance(UpdateMusicScoreDto, { annotations })),
      ).toHaveLength(0);
    }
  });
  it.each([
    { ...stroke, tool: 'script' },
    { ...stroke, color: 'url(javascript:alert(1))' },
    { ...stroke, width: -1 },
    { ...stroke, points: [{ x: 2, y: -1 }] },
    { ...stroke, points: [] },
    { ...stroke, points: Array.from({ length: 4001 }, () => ({ x: 0, y: 0 })) },
  ])('rejects malformed or unbounded strokes', async (invalid) => {
    const dto = plainToInstance(UpdateMusicScoreDto, {
      annotations: [{ page: 'pdf:1', strokes: [invalid] }],
    });
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'annotations',
    );
  });
});
