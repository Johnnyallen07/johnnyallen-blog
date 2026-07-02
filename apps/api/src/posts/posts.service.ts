import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { MediaService } from '../media/media.service';
import { I18nService } from '../i18n/i18n.service';

/** findBySlug 返回的专栏树节点（递归本地化用的最小结构） */
interface SeriesTreeNode {
  id: string;
  title?: string | null;
  post?: { id: string; title: string } | null;
  children?: SeriesTreeNode[];
}

@Injectable()
export class PostsService {
  /** 跟踪已缓存的 key 以便批量清除 */
  private cachedKeys = new Set<string>();

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private mediaService: MediaService,
    private i18n: I18nService,
  ) {}

  /**
   * 本地化文章列表行（文章字段 + 内嵌 category 的 name/description）。
   * zh 快路径原样返回。
   */
  private async localizePostRows<
    T extends { id: string; category?: { id: string } | null },
  >(rows: T[], locale?: string): Promise<T[]> {
    if (!locale || locale === 'zh' || rows.length === 0) return rows;

    const localized = await this.i18n.localize('post', rows, locale);
    const categoryIds = [
      ...new Set(
        localized
          .map((r) => r.category?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const categoryOverrides = await this.i18n.getOverrides(
      'category',
      categoryIds,
      locale,
    );
    if (categoryOverrides.size === 0) return localized;

    return localized.map((r) => {
      const overrides = r.category && categoryOverrides.get(r.category.id);
      return overrides
        ? { ...r, category: { ...r.category, ...overrides } }
        : r;
    });
  }

  /** 递归收集专栏树里的 seriesItem / post id */
  private collectTreeIds(
    nodes: SeriesTreeNode[],
    itemIds: Set<string>,
    postIds: Set<string>,
  ) {
    for (const node of nodes) {
      itemIds.add(node.id);
      if (node.post) postIds.add(node.post.id);
      if (node.children?.length) {
        this.collectTreeIds(node.children, itemIds, postIds);
      }
    }
  }

  /** 递归应用专栏树节点的翻译覆盖（就地修改刚查出的对象） */
  private applyTreeOverrides(
    nodes: SeriesTreeNode[],
    itemOverrides: Map<string, Record<string, string>>,
    postOverrides: Map<string, Record<string, string>>,
  ) {
    for (const node of nodes) {
      const io = itemOverrides.get(node.id);
      if (io?.title && node.title) node.title = io.title;
      if (node.post) {
        const po = postOverrides.get(node.post.id);
        if (po?.title) node.post.title = po.title;
      }
      if (node.children?.length) {
        this.applyTreeOverrides(node.children, itemOverrides, postOverrides);
      }
    }
  }

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
    locale?: string;
  }) {
    const {
      skip = 0,
      take = 20,
      categoryId,
      featured,
      standalone,
      locale,
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

    const cacheKey = `posts:list:${skip}:${take}:${categoryId || ''}:${featured ?? ''}:${published ?? ''}:${locale ?? 'zh'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.post.findMany({
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

    const result = await this.localizePostRows(rows, locale);
    await this.cacheSet(cacheKey, result, 30 * 1000); // 30s TTL
    return result;
  }

  async findLatest(limit = 8, locale?: string) {
    const cacheKey = `posts:latest:${limit}:${locale ?? 'zh'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.post.findMany({
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

    const result = await this.localizePostRows(rows, locale);
    await this.cacheSet(cacheKey, result, 60 * 1000); // 60s
    return result;
  }

  async findFeatured(locale?: string) {
    const cacheKey = `posts:featured:${locale ?? 'zh'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.post.findMany({
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

    // 先本地化再按分类名分组，保证 en 下按译名分组
    const featuredPosts = await this.localizePostRows(rows, locale);

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

  async findBySlug(slug: string, locale?: string) {
    const cacheKey = `post:slug:${slug}:${locale ?? 'zh'}`;
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

    const localized = await this.localizePostDetail(post, locale);
    await this.cacheSet(cacheKey, localized, 60 * 1000); // 60s
    return localized;
  }

  /**
   * 本地化 findBySlug 的完整结构：文章本体 + category + 所属专栏
   * + 专栏树里的每个节点标题（seriesItem.title / 嵌套 post.title）。
   * 对刚查出的对象就地修改（尚未进缓存，安全）。
   */
  private async localizePostDetail<
    T extends {
      id: string;
      title: string;
      excerpt: string | null;
      content: string | null;
      category: { id: string; name: string; description: string | null };
      seriesItems: Array<{
        series: {
          id: string;
          title: string;
          description: string | null;
          items: SeriesTreeNode[];
        };
      }>;
    },
  >(post: T, locale?: string): Promise<T> {
    if (!locale || locale === 'zh') return post;

    // 收集全部需要翻译的 id
    const itemIds = new Set<string>();
    const postIds = new Set<string>([post.id]);
    const seriesIds = new Set<string>();
    for (const si of post.seriesItems) {
      seriesIds.add(si.series.id);
      this.collectTreeIds(si.series.items, itemIds, postIds);
    }

    const [postOverrides, categoryOverrides, seriesOverrides, itemOverrides] =
      await Promise.all([
        this.i18n.getOverrides('post', [...postIds], locale),
        this.i18n.getOverrides('category', [post.category.id], locale),
        this.i18n.getOverrides('series', [...seriesIds], locale),
        this.i18n.getOverrides('seriesItem', [...itemIds], locale),
      ]);

    // 文章本体
    const own = postOverrides.get(post.id);
    if (own) {
      if (own.title) post.title = own.title;
      if (own.excerpt && post.excerpt !== null) post.excerpt = own.excerpt;
      if (own.content && post.content !== null) post.content = own.content;
    }

    // 分类
    const co = categoryOverrides.get(post.category.id);
    if (co) {
      if (co.name) post.category.name = co.name;
      if (co.description && post.category.description !== null) {
        post.category.description = co.description;
      }
    }

    // 专栏与专栏树
    for (const si of post.seriesItems) {
      const so = seriesOverrides.get(si.series.id);
      if (so) {
        if (so.title) si.series.title = so.title;
        if (so.description && si.series.description !== null) {
          si.series.description = so.description;
        }
      }
      this.applyTreeOverrides(si.series.items, itemOverrides, postOverrides);
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
