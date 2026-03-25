import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  private cachedKeys = new Set<string>();

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  private async cacheSet(key: string, value: unknown, ttl: number) {
    this.cachedKeys.add(key);
    await this.cache.set(key, value, ttl);
  }

  /** 清除所有分类相关缓存 */
  private async invalidateCategoryCaches() {
    const keysToDelete = [...this.cachedKeys];
    await Promise.all(keysToDelete.map((k) => this.cache.del(k)));
    this.cachedKeys.clear();
  }

  async findAll() {
    const cacheKey = 'categories:all';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        _count: {
          select: { posts: true },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    await this.cacheSet(cacheKey, result, 300 * 1000); // 5min
    return result;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async findBySlug(slug: string) {
    const cacheKey = `categories:slug:${slug}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          include: { _count: { select: { posts: true } } },
        },
        posts: {
          select: {
            id: true,
            title: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
            published: true,
          },
        },
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    await this.cacheSet(cacheKey, category, 120 * 1000); // 2min
    return category;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const result = await this.prisma.category.create({
      data: createCategoryDto,
    });

    await this.invalidateCategoryCaches();
    return result;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id); // Check if exists

    const result = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });

    await this.invalidateCategoryCaches();
    return result;
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists

    const result = await this.prisma.category.delete({
      where: { id },
    });

    await this.invalidateCategoryCaches();
    return result;
  }

  // Seed method for initial categories
  async seed() {
    const defaultCategories = [
      {
        name: 'Game Guides',
        slug: 'game-guides',
        description:
          'Tips, strategies, and walkthroughs for your favorite games',
        icon: 'Gamepad2',
      },
      {
        name: 'Music Recommendations',
        slug: 'music-recommendations',
        description: 'Discover new music and curated playlists',
        icon: 'Music',
      },
      {
        name: 'Sheet Music Organization',
        slug: 'sheet-music-organization',
        description: 'Organize and manage your sheet music collection',
        icon: 'Music',
      },
      {
        name: 'Technical Sharing',
        slug: 'technical-sharing',
        description: 'Tech tutorials, coding tips, and development insights',
        icon: 'Code',
      },
    ];

    const existingCategories = await this.prisma.category.findMany();

    if (existingCategories.length === 0) {
      for (const category of defaultCategories) {
        await this.prisma.category.create({
          data: category,
        });
      }
      console.log('Seeded default categories');
    }
  }
  async getTree() {
    const cacheKey = 'categories:tree';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      include: {
        children: {
          include: {
            children: true, // Support up to 2 levels of nesting for now
            _count: { select: { posts: true } },
          },
        },
        _count: {
          select: { posts: true },
        },
      },
      where: {
        parentId: null, // Get root categories
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    await this.cacheSet(cacheKey, categories, 300 * 1000); // 5min
    return categories;
  }

  async findContent(slug: string) {
    const cacheKey = `categories:content:${slug}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        series: {
          where: { published: true },
          include: {
            _count: {
              select: { items: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        posts: {
          where: { published: true, seriesItems: { none: {} } }, // Only independent posts
          orderBy: { createdAt: 'desc' },
          take: 20, // Limit for now, pagination can be added later
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    const result = {
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      series: category.series,
      posts: category.posts,
    };

    await this.cacheSet(cacheKey, result, 60 * 1000); // 60s
    return result;
  }
}
