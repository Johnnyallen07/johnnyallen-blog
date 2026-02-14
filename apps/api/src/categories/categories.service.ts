import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
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

    return category;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists

    return this.prisma.category.delete({
      where: { id },
    });
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
    return categories;
  }

  async findContent(slug: string) {
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
          include: {
            author: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20, // Limit for now, pagination can be added later
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    return {
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      series: category.series,
      posts: category.posts,
    };
  }
}
