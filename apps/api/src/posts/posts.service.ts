import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { MediaService } from '../media/media.service';

@Injectable()
export class PostsService {
  /** 跟踪已缓存的 key 以便批量清除 */
  private cachedKeys = new Set<string>();

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private mediaService: MediaService,
  ) {}

  private async cacheSet(key: string, value: unknown, ttl: number) {
    this.cachedKeys.add(key);
    await this.cache.set(key, value, ttl);
  }

  /** 清除所有 post 相关缓存 */
  private async invalidatePostCaches() {
    const keysToDelete = [...this.cachedKeys];
    await Promise.all(keysToDelete.map((k) => this.cache.del(k)));
    this.cachedKeys.clear();
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    categoryId?: string;
    featured?: boolean;
    published?: boolean;
    standalone?: boolean;
  }) {
    const {
      skip = 0,
      take = 20,
      categoryId,
      featured,
      standalone,
    } = options || {};

    // standalone=true 是管理后台调用，不过滤 published（显示草稿 + 已发布）
    // 其他情况默认只展示 published=true（公开页面）
    const published =
      options?.published !== undefined
        ? options.published
        : standalone
          ? undefined
          : true;

    // 管理后台请求不缓存
    if (standalone) {
      return this.prisma.post.findMany({
        where: {
          ...(categoryId && { categoryId }),
          ...(featured !== undefined && { featured }),
          ...(published !== undefined && { published }),
          ...(standalone && { seriesItems: { none: {} } }),
        },
        include: {
          category: true,
          media: true,
          _count: {
            select: { seriesItems: true },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take,
      });
    }

    const cacheKey = `posts:list:${skip}:${take}:${categoryId || ''}:${featured ?? ''}:${published ?? ''}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.post.findMany({
      where: {
        ...(categoryId && { categoryId }),
        ...(featured !== undefined && { featured }),
        ...(published !== undefined && { published }),
      },
      include: {
        category: true,
        media: true,
        _count: {
          select: { seriesItems: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take,
    });

    await this.cacheSet(cacheKey, result, 30 * 1000); // 30s TTL
    return result;
  }

  async findLatest(limit = 8) {
    const cacheKey = `posts:latest:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.post.findMany({
      where: {
        published: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    });

    await this.cacheSet(cacheKey, result, 60 * 1000); // 60s
    return result;
  }

  async findFeatured() {
    const cacheKey = 'posts:featured';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const featuredPosts = await this.prisma.post.findMany({
      where: {
        published: true,
        featured: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
          },
        },
        media: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Group by category
    const grouped = featuredPosts.reduce(
      (acc, post) => {
        const categoryName = post.category.name;
        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }
        acc[categoryName].push(post);
        return acc;
      },
      {} as Record<string, typeof featuredPosts>,
    );

    await this.cacheSet(cacheKey, grouped, 120 * 1000); // 120s
    return grouped;
  }

  async findBySlug(slug: string) {
    const cacheKey = `post:slug:${slug}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const post = await this.prisma.post.findUnique({
      where: { slug },
      include: {
        category: true,
        media: true,
        seriesItems: {
          include: {
            series: {
              include: {
                items: {
                  where: {
                    parentId: null,
                  },
                  orderBy: {
                    order: 'asc',
                  },
                  include: {
                    post: {
                      select: {
                        id: true,
                        title: true,
                        slug: true,
                        published: true,
                      },
                    },
                    children: {
                      orderBy: {
                        order: 'asc',
                      },
                      include: {
                        post: {
                          select: {
                            id: true,
                            title: true,
                            slug: true,
                            published: true,
                          },
                        },
                        children: {
                          orderBy: { order: 'asc' },
                          include: {
                            post: {
                              select: {
                                id: true,
                                title: true,
                                slug: true,
                                published: true,
                              },
                            },
                            children: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException(`Post with slug "${slug}" not found`);
    }

    await this.cacheSet(cacheKey, post, 60 * 1000); // 60s
    return post;
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        category: true,
        media: true,
        seriesItems: {
          include: {
            series: {
              select: {
                id: true,
                title: true,
                slug: true,
                emoji: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }

    return post;
  }

  async create(createPostDto: CreatePostDto) {
    const result = await this.prisma.post.create({
      data: createPostDto,
      include: {
        category: true,
      },
    });

    await this.invalidatePostCaches();
    await this.mediaService.syncPostMedia(result.id, result.content);
    return result;
  }

  async update(id: string, updatePostDto: UpdatePostDto) {
    await this.findOne(id);

    // Extract seriesId from DTO (it's not a direct Post field)
    const { seriesId, ...postData } = updatePostDto;

    // Update the post data
    await this.prisma.post.update({
      where: { id },
      data: postData,
    });

    // 同步 SeriesItem.published 状态（双向同步）
    if (postData.published !== undefined) {
      await this.prisma.seriesItem.updateMany({
        where: { postId: id },
        data: { published: postData.published },
      });
    }

    // Handle series binding/unbinding if seriesId is explicitly provided
    if (seriesId !== undefined) {
      await this.handleSeriesBinding(id, seriesId);
    }

    // 清除缓存
    await this.invalidatePostCaches();
    if (postData.content !== undefined) {
      await this.mediaService.syncPostMedia(id, postData.content);
    }

    // Re-fetch to get updated data including series info
    return this.findOne(id);
  }

  /**
   * 处理文章与系列的绑定关系
   * @param postId 文章 ID
   * @param seriesId 目标 Series ID（null 表示解除所有绑定）
   */
  private async handleSeriesBinding(
    postId: string,
    seriesId: string | null,
  ): Promise<void> {
    // Get current series bindings for this post
    const currentItems = await this.prisma.seriesItem.findMany({
      where: { postId },
    });

    if (seriesId === null) {
      // Unbind from all series → post becomes standalone
      if (currentItems.length > 0) {
        await this.prisma.seriesItem.deleteMany({
          where: { postId },
        });
      }
      return;
    }

    // Check if already bound to the target series
    const alreadyBound = currentItems.some(
      (item) => item.seriesId === seriesId,
    );
    if (alreadyBound) {
      return; // No change needed
    }

    // Remove from any other series first
    if (currentItems.length > 0) {
      await this.prisma.seriesItem.deleteMany({
        where: { postId },
      });
    }

    // Get max order for root items in target series
    const lastItem = await this.prisma.seriesItem.findFirst({
      where: { seriesId, parentId: null },
      orderBy: { order: 'desc' },
    });

    // Bind to new series at root level
    await this.prisma.seriesItem.create({
      data: {
        seriesId,
        postId,
        order: (lastItem?.order ?? -1) + 1,
      },
    });
  }

  /**
   * 检查 slug 是否已被其他文章占用
   * @param slug 要检查的 slug
   * @param excludeId 排除的文章 ID（编辑时排除自身）
   */
  async checkSlug(
    slug: string,
    excludeId?: string,
  ): Promise<{ available: boolean; existingId?: string }> {
    const existing = await this.prisma.post.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return { available: true };
    }

    if (excludeId && existing.id === excludeId) {
      return { available: true };
    }

    return { available: false, existingId: existing.id };
  }

  async remove(id: string) {
    const post = await this.findOne(id);
    const contentKeys = this.mediaService
      .extractMediaRefsFromHtml(post.content)
      .map((media) => media.key);
    const keys = [...post.media.map((media) => media.key), ...contentKeys];

    const result = await this.prisma.post.delete({
      where: { id },
    });

    await this.mediaService.deleteUnreferencedMediaObjects(keys);
    await this.invalidatePostCaches();
    return result;
  }

  async incrementViews(id: string) {
    return this.prisma.post.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { id: true, views: true },
    });
  }

  async toggleLike(id: string, action: 'like' | 'unlike') {
    return this.prisma.post.update({
      where: { id },
      data: {
        likes: action === 'like' ? { increment: 1 } : { decrement: 1 },
      },
      select: { id: true, likes: true },
    });
  }
}
