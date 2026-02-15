import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  async findAll(options?: {
    skip?: number;
    take?: number;
    categoryId?: string;
    featured?: boolean;
    published?: boolean;
    standalone?: boolean;
  }) {
    const { skip = 0, take = 20, categoryId, featured, standalone } =
      options || {};

    // standalone=true 是管理后台调用，不过滤 published（显示草稿 + 已发布）
    // 其他情况默认只展示 published=true（公开页面）
    const published =
      options?.published !== undefined
        ? options.published
        : standalone
          ? undefined
          : true;

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
        createdAt: 'desc',
      },
      skip,
      take,
    });
  }

  async findLatest(limit = 8) {
    return this.prisma.post.findMany({
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
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async findFeatured() {
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
        createdAt: 'desc',
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

    return grouped;
  }

  async findBySlug(slug: string) {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      include: {
        category: true,
        media: true,
        seriesItems: {
          where: { published: true }, // 只返回已发布的 SeriesItem
          include: {
            series: {
              include: {
                items: {
                  where: {
                    parentId: null,
                    published: true,
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
                      where: { published: true },
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
                          where: { published: true },
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
    return this.prisma.post.create({
      data: createPostDto,
      include: {
        category: true,
      },
    });
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

    // Handle series binding/unbinding if seriesId is explicitly provided
    if (seriesId !== undefined) {
      await this.handleSeriesBinding(id, seriesId);
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
    await this.findOne(id);

    return this.prisma.post.delete({
      where: { id },
    });
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
