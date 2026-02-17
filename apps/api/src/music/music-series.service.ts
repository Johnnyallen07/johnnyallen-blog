import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSidebarEntityDto } from './dto/create-sidebar-entity.dto';
import { UpdateSidebarEntityDto } from './dto/update-sidebar-entity.dto';

@Injectable()
export class MusicSeriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.musicSeries.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async create(dto: CreateSidebarEntityDto) {
    const maxOrder = await this.prisma.musicSeries.aggregate({
      _max: { order: true },
    });
    return this.prisma.musicSeries.create({
      data: { ...dto, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  async update(id: string, dto: UpdateSidebarEntityDto) {
    const entity = await this.prisma.musicSeries.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Series not found');
    return this.prisma.musicSeries.update({ where: { id }, data: dto });
  }

  async reorder(ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.musicSeries.update({ where: { id }, data: { order: index } }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string) {
    const entity = await this.prisma.musicSeries.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('Series not found');
    return this.prisma.musicSeries.delete({ where: { id } });
  }
}
