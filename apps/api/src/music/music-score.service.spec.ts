import { MusicScoreService } from './music-score.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
const deleteObject = jest.fn();
jest.mock('cos-nodejs-sdk-v5', () =>
  jest.fn().mockImplementation(() => ({ deleteObject })),
);

const oldPage = {
  key: 'scores/old.png',
  url: 'https://example.com/old.png',
  size: 20,
};
const newPage = {
  key: 'scores/new.png',
  url: 'https://example.com/new.png',
  size: 30,
};

describe('MusicScoreService edits', () => {
  const prisma = { musicScore: { findUnique: jest.fn(), update: jest.fn() } };
  const i18n = { localizeOne: (_type: string, value: unknown) => value };
  let service: MusicScoreService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.musicScore.findUnique.mockResolvedValue({
      id: 'score',
      fileType: 'images',
      fileKey: oldPage.key,
      pages: [oldPage],
    });
    prisma.musicScore.update.mockResolvedValue({
      id: 'score',
      pages: [newPage],
    });
    service = new MusicScoreService(prisma as never, i18n as never);
  });
  it('does not delete the original image if saving the cropped replacement fails', async () => {
    prisma.musicScore.update.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );
    await expect(service.update('score', { pages: [newPage] })).rejects.toThrow(
      'Database unavailable',
    );
    expect(deleteObject).not.toHaveBeenCalled();
  });
  it('commits the cropped replacement and metadata before removing the original', async () => {
    await service.update('score', { pages: [newPage] });
    expect(prisma.musicScore.update).toHaveBeenCalledWith({
      where: { id: 'score' },
      data: expect.objectContaining({
        pages: [newPage],
        pageCount: 1,
        fileSize: 30,
        fileKey: newPage.key,
        coverUrl: newPage.url,
      }),
    });
    expect(deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ Key: oldPage.key }),
      expect.any(Function),
    );
    expect(prisma.musicScore.update.mock.invocationCallOrder[0]).toBeLessThan(
      deleteObject.mock.invocationCallOrder[0]!,
    );
  });
  it('can clear annotations without modifying or deleting score files', async () => {
    await service.update('score', { annotations: [] });
    expect(prisma.musicScore.update).toHaveBeenCalledWith({
      where: { id: 'score' },
      data: { annotations: [] },
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
