import { validate } from 'class-validator';
import { CreateMusicScoreDto } from './create-music-score.dto';

describe('CreateMusicScoreDto', () => {
  it('allows creating a score without a composer', async () => {
    const dto = new CreateMusicScoreDto();
    dto.title = 'Scale Practice';
    dto.instrument = '小提琴';
    dto.fileKey = 'scores/scale-practice.pdf';
    dto.fileUrl = 'https://example.com/scale-practice.pdf';
    dto.fileSize = 1024;
    dto.pageCount = 2;

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).not.toContain('composer');
  });
});
