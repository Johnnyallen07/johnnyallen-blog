jest.mock('../media/media.service', () => ({
  MediaService: class MediaService {},
}));

import { PostsService } from './posts.service';

describe('PostsService ordering', () => {
  const createService = () => {
    const prisma = {
      post: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const mediaService = {
      syncPostMedia: jest.fn(),
    };

    const service = new PostsService(
      prisma as never,
      cache as never,
      mediaService as never,
    );

    return { service, prisma };
  };

  it('orders public post lists by update time descending', async () => {
    const { service, prisma } = createService();

    await service.findAll({ take: 10 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('orders latest posts by update time descending', async () => {
    const { service, prisma } = createService();

    await service.findLatest(5);

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });
});
