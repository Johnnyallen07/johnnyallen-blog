import { MomentService } from './moment.service';

describe('MomentService multipart uploads', () => {
  it('starts a resumable upload with a durable COS upload id', async () => {
    const prisma = {
      momentAsset: { findFirst: jest.fn().mockResolvedValue(null) },
      momentAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const storage = {
      createObjectKey: jest.fn().mockReturnValue('moment/vault/new.jpg'),
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      abortMultipartUpload: jest.fn(),
    };
    const service = new MomentService(prisma as never, storage as never);

    await expect(service.startMultipartUpload({
      relativePath: 'Album/new.jpg',
      checksum: 'a'.repeat(64),
      mimeType: 'image/jpeg',
      size: String(20 * 1024 * 1024),
    }, 'admin')).resolves.toMatchObject({
      exists: false,
      objectKey: 'moment/vault/new.jpg',
      uploadId: 'upload-1',
      partSize: 8 * 1024 * 1024,
    });
  });

  it('rejects a non-contiguous server part list before completing', async () => {
    const prisma = { momentAuditLog: { create: jest.fn() } };
    const storage = {
      multipartParts: jest.fn().mockResolvedValue([
        { partNumber: 1, etag: 'one', size: 8 },
        { partNumber: 3, etag: 'three', size: 2 },
      ]),
      completeMultipartUpload: jest.fn(),
    };
    const service = new MomentService(prisma as never, storage as never);

    await expect(service.completeMultipartUpload({
      objectKey: 'moment/vault/new.jpg',
      uploadId: 'upload-1',
      size: '10',
      partSize: 8,
    }, 'admin')).rejects.toThrow('分片清单不连续');
    expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
  });
});
