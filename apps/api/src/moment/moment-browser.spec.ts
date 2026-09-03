import { MomentService } from './moment.service';

const asset = {
  id: 'photo-1',
  objectKey: 'moment/vault/photo.heic',
  checksum: 'a'.repeat(64),
  originalName: 'IMG_1656.HEIC',
  relativePath: 'Temp Photo/IMG_1656.HEIC',
  title: null,
  description: null,
  mimeType: 'application/octet-stream',
  size: 1024n,
  capturedAt: null,
  width: null,
  height: null,
  xmpMetadata: null,
  metadataText: '',
  tags: [],
  visibility: 'PRIVATE',
  featured: false,
  status: 'READY',
  trashedAt: null,
  categoryId: 'folder-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('MomentService browser', () => {
  it('paginates primary files and groups a same-stem XMP sidecar with HEIC', async () => {
    const sidecar = {
      id: 'xmp-1',
      categoryId: 'folder-1',
      originalName: 'IMG_1656.xmp',
      relativePath: 'Temp Photo/IMG_1656.xmp',
      mimeType: 'application/rdf+xml',
      size: 512n,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      xmpMetadata: { model: 'Camera' },
    };
    const prisma = {
      momentCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      momentAsset: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([asset])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([sidecar]),
        count: jest.fn().mockResolvedValue(21),
      },
    };
    const service = new MomentService(prisma as never, {} as never);

    const result = await service.browser({
      folderId: 'folder-1',
      page: 2,
      limit: 20,
      trash: false,
      includeSidecars: false,
    });

    expect(prisma.momentAsset.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(result).toMatchObject({ total: 21, page: 2, pages: 2 });
    expect(result.assets[0]).toMatchObject({
      id: 'photo-1',
      size: '1024',
      sidecar: { id: 'xmp-1', size: '512' },
      sidecars: [{ id: 'xmp-1', size: '512' }],
    });
  });

  it('uses a bounded converted preview for HEIC even without an image MIME type', async () => {
    const prisma = {
      momentAsset: { findFirst: jest.fn().mockResolvedValue(asset) },
    };
    const storage = {
      createImagePreviewUrl: jest.fn().mockResolvedValue('https://preview'),
      createDownloadUrl: jest.fn(),
    };
    const service = new MomentService(prisma as never, storage as never);

    await expect(
      service.assetUrl('photo-1', false, false, true),
    ).resolves.toEqual({
      url: 'https://preview',
      expiresIn: 300,
    });
    expect(storage.createImagePreviewUrl).toHaveBeenCalledWith(
      'moment/vault/photo.heic',
      2048,
    );
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
