import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { UpdateSeriesStructureDto } from './dto/update-series-structure.dto';

export interface SeriesTreeItem {
  id: string;
  seriesId: string;
  parentId: string | null;
  postId: string | null;
  title: string | null;
  order: number;
  children: SeriesTreeItem[];
  post?: {
    id: string;
    title: string;
    slug: string;
    published: boolean;
  } | null;
}

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSeriesDto: CreateSeriesDto) {
    const { withDefaults, ...data } = createSeriesDto;
    const series = await this.prisma.series.create({
      data,
    });

    if (withDefaults) {
      // Create default structure:
      // 1. "Getting Started" folder
      //    - "Welcome" post
      // 2. "Drafts" folder

      // Root "Getting Started" folder
      const gettingStarted = await this.prisma.seriesItem.create({
        data: {
          seriesId: series.id,
          title: 'Getting Started',
          order: 0,
        },
      });

      // "Welcome" post inside "Getting Started"
      // First create the post
      const welcomePost = await this.prisma.post.create({
        data: {
          title: 'Welcome to your new Series',
          slug: `${series.slug}-welcome`,
          content: '# Welcome\n\nThis is the start of your new series.',
          authorId: data.authorId,
          categoryId: data.categoryId,
          published: true,
        },
      });

      // Link post to series item
      await this.prisma.seriesItem.create({
        data: {
          seriesId: series.id,
          parentId: gettingStarted.id,
          postId: welcomePost.id,
          order: 0,
        },
      });

      // Root "Drafts" folder
      await this.prisma.seriesItem.create({
        data: {
          seriesId: series.id,
          title: 'Drafts',
          order: 1,
        },
      });
    }

    return series;
  }

  async update(id: string, updateSeriesDto: UpdateSeriesDto) {
    const { ...data } = updateSeriesDto;

    // Check if slug is unique if it's being updated
    if (data.slug) {
      const existing = await this.prisma.series.findUnique({
        where: { slug: data.slug },
      });
      if (existing && existing.id !== id) {
        throw new Error('Slug already exists');
      }
    }

    return this.prisma.series.update({
      where: { id },
      data,
    });
  }

  async findAll() {
    return this.prisma.series.findMany({
      include: {
        category: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: {
        category: true,
        items: {
          include: {
            post: {
              select: {
                id: true,
                title: true,
                slug: true,
                published: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!series) {
      throw new NotFoundException(`Series with ID ${id} not found`);
    }

    // Build tree structure
    const items = series.items;
    const itemMap = new Map<string, SeriesTreeItem>(
      items.map((item) => [
        item.id,
        { ...item, children: [] } as SeriesTreeItem,
      ]),
    );
    const rootItems: SeriesTreeItem[] = [];

    for (const item of items) {
      const node = itemMap.get(item.id);
      if (node) {
        if (item.parentId) {
          const parent = itemMap.get(item.parentId);
          if (parent) {
            parent.children.push(node);
          } else {
            // Orphaned node, treat as root
            rootItems.push(node);
          }
        } else {
          rootItems.push(node);
        }
      }
    }

    return { ...series, tree: rootItems };
  }

  async addItem(
    seriesId: string,
    dto: { postId?: string; title?: string; parentId?: string },
  ) {
    const type = dto.postId ? 'POST' : 'FOLDER';
    return this.addPixel(
      seriesId,
      dto.parentId ?? null,
      type,
      dto.postId,
      dto.title,
    );
  }

  async updateStructure(id: string, dto: UpdateSeriesStructureDto) {
    // Use transaction to ensure consistency
    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.seriesItem.update({
          where: { id: item.id, seriesId: id }, // Ensure item belongs to series
          data: {
            parentId: item.parentId,
            order: item.order,
          },
        });
      }
      return this.findOne(id);
    });
  }

  async addPixel(
    seriesId: string,
    parentId: string | null,
    type: 'FOLDER' | 'POST',
    postId?: string,
    title?: string,
  ) {
    if (type === 'POST' && !postId) {
      throw new Error('Post ID is required for POST type items');
    }

    if (type === 'FOLDER' && !title) {
      throw new Error('Title is required for FOLDER type items');
    }

    // Get max order in the parent
    const lastItem = await this.prisma.seriesItem.findFirst({
      where: {
        seriesId,
        parentId,
      },
      orderBy: {
        order: 'desc',
      },
    });

    const newOrder = (lastItem?.order ?? -1) + 1;

    return this.prisma.seriesItem.create({
      data: {
        seriesId,
        parentId,
        postId: type === 'POST' ? postId : null,
        title: type === 'FOLDER' ? title : null, // If it's a folder, we use the title on SeriesItem
        order: newOrder,
      },
      include: {
        post: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.series.delete({ where: { id } });
  }

  async removeSeriesItem(itemId: string) {
    // 1. Check if item exists
    const item = await this.prisma.seriesItem.findUnique({
      where: { id: itemId },
      include: { children: true },
    });

    if (!item) {
      throw new NotFoundException(`Series Item ${itemId} not found`);
    }

    // 2. If it's a folder with children, we might want to prevent delete or cascade.
    // Ideally, for a "Folder", we delete all children (recursive) or move them up.
    // For simplicity, let's use Prisma's cascade delete if configured, or delete manually.
    // Since we don't have explicit cascade keys in code visible, let's just delete the item.
    // Prisma usually requires defining behavior in schema. If not defined, this might fail if children exist.
    // Let's assume we want to delete this specific item. If it has children, we should probably delete them too.

    // Recursive delete helper (if not using DB cascade)
    const deleteRecursive = async (id: string) => {
      const children = await this.prisma.seriesItem.findMany({
        where: { parentId: id },
      });
      for (const child of children) {
        await deleteRecursive(child.id);
      }
      await this.prisma.seriesItem.delete({ where: { id } });
    };

    await deleteRecursive(itemId);
    return { success: true, id: itemId };
  }

  async updateSeriesItem(itemId: string, dto: { title?: string }) {
    return this.prisma.seriesItem.update({
      where: { id: itemId },
      data: {
        title: dto.title,
      },
    });
  }
}
