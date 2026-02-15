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
  published: boolean;
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
    const { ...data } = createSeriesDto;
    return this.prisma.series.create({ data });
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

  /**
   * findOne - 管理后台使用，返回所有 items（不过滤 published）
   */
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

    return { ...series, tree: this.buildTree(series.items) };
  }

  /**
   * 构建树形结构
   */
  private buildTree(
    items: Array<{
      id: string;
      seriesId: string;
      parentId: string | null;
      postId: string | null;
      title: string | null;
      published: boolean;
      order: number;
      post?: {
        id: string;
        title: string;
        slug: string;
        published: boolean;
      } | null;
    }>,
  ): SeriesTreeItem[] {
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
            rootItems.push(node);
          }
        } else {
          rootItems.push(node);
        }
      }
    }

    return rootItems;
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
    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.seriesItem.update({
          where: { id: item.id, seriesId: id },
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

    const lastItem = await this.prisma.seriesItem.findFirst({
      where: { seriesId, parentId },
      orderBy: { order: 'desc' },
    });

    const newOrder = (lastItem?.order ?? -1) + 1;

    return this.prisma.seriesItem.create({
      data: {
        seriesId,
        parentId,
        postId: type === 'POST' ? postId : null,
        title: type === 'FOLDER' ? title : null,
        order: newOrder,
        published: false, // 新建默认为未发布
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
    const item = await this.prisma.seriesItem.findUnique({
      where: { id: itemId },
      include: { children: true },
    });

    // 如果 item 已被删除（快速连续操作），直接返回成功
    if (!item) {
      return { success: true, id: itemId };
    }

    const deleteRecursive = async (id: string) => {
      const children = await this.prisma.seriesItem.findMany({
        where: { parentId: id },
      });
      for (const child of children) {
        await deleteRecursive(child.id);
      }
      // 使用 deleteMany 避免 item 不存在时抛出异常
      await this.prisma.seriesItem.deleteMany({ where: { id } });
    };

    await deleteRecursive(itemId);
    return { success: true, id: itemId };
  }

  /**
   * 更新 SeriesItem（标题 / 发布状态 / 移动到其他父级）
   */
  async updateSeriesItem(
    itemId: string,
    dto: { title?: string; published?: boolean; parentId?: string | null },
  ) {
    const data: {
      title?: string;
      published?: boolean;
      parentId?: string | null;
      order?: number;
    } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.published !== undefined) data.published = dto.published;

    // 移动到其他文件夹（parentId: string 或 null 表示移到根级）
    if (dto.parentId !== undefined) {
      // 防止将文件夹移到自身内部
      if (dto.parentId === itemId) {
        throw new Error('Cannot move item into itself');
      }

      data.parentId = dto.parentId;

      // 获取目标文件夹下的最大 order
      const item = await this.prisma.seriesItem.findUnique({
        where: { id: itemId },
      });
      if (!item) {
        throw new NotFoundException(`Series Item ${itemId} not found`);
      }

      const lastItem = await this.prisma.seriesItem.findFirst({
        where: { seriesId: item.seriesId, parentId: dto.parentId },
        orderBy: { order: 'desc' },
      });
      data.order = (lastItem?.order ?? -1) + 1;
    }

    return this.prisma.seriesItem.update({
      where: { id: itemId },
      data,
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
    });
  }
}
