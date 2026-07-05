import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
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

  it('allows an image score with ordered pages', async () => {
    const dto = plainToInstance(CreateMusicScoreDto, {
      title: 'Etude No.1',
      instrument: '小提琴',
      fileType: 'images',
      pages: [
        { key: 'scores/a.jpg', url: 'https://example.com/a.jpg', size: 100 },
        { key: 'scores/b.jpg', url: 'https://example.com/b.jpg' },
      ],
      fileKey: 'scores/a.jpg',
      fileUrl: 'https://example.com/a.jpg',
      fileSize: 200,
      pageCount: 2,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown fileType and malformed pages', async () => {
    const dto = plainToInstance(CreateMusicScoreDto, {
      title: 'Bad',
      instrument: '钢琴',
      fileType: 'zip',
      pages: [{ url: 42 }],
      fileKey: 'scores/x.pdf',
      fileUrl: 'https://example.com/x.pdf',
      fileSize: 1,
      pageCount: 1,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toContain('fileType');
    expect(properties).toContain('pages');
  });
});
