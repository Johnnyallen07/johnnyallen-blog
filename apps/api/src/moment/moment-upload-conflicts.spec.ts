import { MomentService } from './moment.service';

describe('MomentService upload conflict detection', () => {
  const existing = {
    id: 'asset-1',
    objectKey: 'moment/vault/old.jpg',
    checksum: 'a'.repeat(64),
    originalName: 'photo.jpg',
    relativePath: 'Trips/photo.jpg',
    title: null,
    description: null,
    mimeType: 'image/jpeg',
    size: 123n,
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    width: 1200,
    height: 800,
    tags: [],
    visibility: 'PRIVATE',
    featured: false,
    status: 'READY',
    trashedAt: null,
    categoryId: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  };

  it('reports exact content and metadata reasons without creating an upload', async () => {
    const prisma = {
      momentAsset: {
        findMany: jest.fn().mockResolvedValue([existing]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(null),
      },
    };
    const storage = { createUploadUrl: jest.fn() };
    const service = new MomentService(prisma as never, storage as never);

    const result = await service.checkUpload({
      relativePath: 'Trips/photo.jpg',
      checksum: 'a'.repeat(64),
      mimeType: 'image/jpeg',
      size: '123',
      capturedAt: '2026-01-02T03:04:05.000Z',
    });

    expect(result.duplicate).toBe(true);
    expect(result.pathMatch?.id).toBe('asset-1');
    expect(result.candidates[0]?.reasons).toEqual([
      'same-path',
      'same-content',
      'same-name',
      'same-size',
      'same-type',
      'same-date',
    ]);
    expect(result.suggestedPath).toBe('Trips/photo (副本).jpg');
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it('increments the copy suffix until an unused path is found', async () => {
    const prisma = {
      momentAsset: {
        findMany: jest.fn().mockResolvedValue([existing]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'copy-1' })
          .mockResolvedValueOnce({ id: 'copy-2' })
          .mockResolvedValueOnce(null),
      },
    };
    const service = new MomentService(prisma as never, {} as never);

    const result = await service.checkUpload({
      relativePath: 'Trips/photo.jpg',
      checksum: 'b'.repeat(64),
      mimeType: 'image/jpeg',
      size: '123',
    });

    expect(result.suggestedPath).toBe('Trips/photo (副本 3).jpg');
  });
});
