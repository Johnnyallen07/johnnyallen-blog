import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSidebarEntityDto } from './dto/create-sidebar-entity.dto';
import { UpdateSidebarEntityDto } from './dto/update-sidebar-entity.dto';
import { I18nService } from '../i18n/i18n.service';

@Injectable()
export class MusicArtistService {
  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  /** 非 zh 时额外返回 sourceName（中文原名），供前端与曲目筛选键匹配 */
  async findAll(locale?: string) {
    const rows = await this.prisma.musicArtist.findMany({
      orderBy: { order: 'asc' },
    });
    if (!locale || locale === 'zh') return rows;

    const localized = await this.i18n.localize('musicArtist', rows, locale);
    return localized.map((r, i) => ({ ...r, sourceName: rows[i].name }));
  }

  async create(dto: CreateSidebarEntityDto) {
    const maxOrder = await this.prisma.musicArtist.aggregate({
      _max: { order: true },
    });
    return this.prisma.musicArtist.create({
      data: { ...dto, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: string, dto: UpdateSidebarEntityDto) {
    const entity = await this.prisma.musicArtist.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Artist not found');
    return this.prisma.musicArtist.update({ where: { id }, data: dto });
  }

  async reorder(ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.musicArtist.update({ where: { id }, data: { order: index } }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string) {
    const entity = await this.prisma.musicArtist.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Artist not found');
    return this.prisma.musicArtist.delete({ where: { id } });
  }
}
