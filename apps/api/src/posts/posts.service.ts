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
    const {
      skip = 0,
      take = 20,
      categoryId,
      featured,
      published = true,
      standalone,
    } = options || {};

    return this.prisma.post.findMany({
      where: {
        ...(categoryId && { categoryId }),
        ...(featured !== undefined && { featured }),
        published,
        ...(standalone && { seriesItems: { none: {} } }),
      },
      include: {
        category: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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
        author: {
          select: {
            id: true,
            name: true,
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
        author: {
          select: {
            id: true,
            name: true,
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
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
        seriesItems: {
          include: {
            series: {
              include: {
                items: {
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
                          // Level 3
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
                            children: true, // Level 4 exists?
                          },
                        },
                      },
                    },
                  },
                  where: {
                    parentId: null, // Only fetch root items here, children are fetched recursively?
                    // actually Prisma needs recursive include or raw query for unlimited depth.
                    // For now, let's include items and handle tree in code or just 3 levels deep.
                    // Wait, if I include `items` on series, it includes ALL items if I don't filter by parentId.
                    // But the tree structure is defined by `parentId`.
                    // It's better to fetch ALL items for the series and construct tree on frontend or service.
                    // Let's fetch all items flat and let frontend build tree? Or build it here.
                    // The previous implementation in SeriesEditor uses `tree` property? No, it uses `items`?
                    // Let's rely on fetching all items for the series.
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
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
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
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async update(id: string, updatePostDto: UpdatePostDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.post.update({
      where: { id },
      data: updatePostDto,
      include: {
        category: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists

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
