import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSidebarEntityDto } from './dto/create-sidebar-entity.dto';
import { UpdateSidebarEntityDto } from './dto/update-sidebar-entity.dto';
import { I18nService } from '../i18n/i18n.service';

@Injectable()
export class MusicCategoryService {
  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  /** 非 zh 时额外返回 sourceName（中文原名），供前端与曲目筛选键匹配 */
  async findAll(locale?: string) {
    const rows = await this.prisma.musicCategory.findMany({
      orderBy: { order: 'asc' },
    });
    if (!locale || locale === 'zh') return rows;

    const localized = await this.i18n.localize('musicCategory', rows, locale);
    return localized.map((r, i) => ({ ...r, sourceName: rows[i].name }));
  }

  async create(dto: CreateSidebarEntityDto) {
    const maxOrder = await this.prisma.musicCategory.aggregate({
      _max: { order: true },
    });
    return this.prisma.musicCategory.create({
      data: { ...dto, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: string, dto: UpdateSidebarEntityDto) {
    const entity = await this.prisma.musicCategory.findUnique({
      where: { id },
    });
    if (!entity) throw new NotFoundException('Category not found');
    return this.prisma.musicCategory.update({ where: { id }, data: dto });
  }

  async reorder(ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.musicCategory.update({
        where: { id },
        data: { order: index },
      }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string) {
    const entity = await this.prisma.musicCategory.findUnique({
      where: { id },
    });
    if (!entity) throw new NotFoundException('Category not found');
    return this.prisma.musicCategory.delete({ where: { id } });
  }
}
