import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSidebarEntityDto } from './dto/create-sidebar-entity.dto';
import { UpdateSidebarEntityDto } from './dto/update-sidebar-entity.dto';

@Injectable()
export class MusicCategoryService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.musicCategory.findMany({
            orderBy: { order: 'asc' },
        });
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
        const entity = await this.prisma.musicCategory.findUnique({ where: { id } });
        if (!entity) throw new NotFoundException('Category not found');
        return this.prisma.musicCategory.update({ where: { id }, data: dto });
    }

    async reorder(ids: string[]) {
        const updates = ids.map((id, index) =>
            this.prisma.musicCategory.update({ where: { id }, data: { order: index } }),
        );
        return this.prisma.$transaction(updates);
    }

    async remove(id: string) {
        const entity = await this.prisma.musicCategory.findUnique({ where: { id } });
        if (!entity) throw new NotFoundException('Category not found');
        return this.prisma.musicCategory.delete({ where: { id } });
    }
}
