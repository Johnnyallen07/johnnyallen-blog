import { Injectable, NotFoundException } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMusicTrackDto } from './dto/create-music-track.dto';
import { UpdateMusicTrackDto } from './dto/update-music-track.dto';

@Injectable()
export class MusicService {
    private cos: COS;

    constructor(private prisma: PrismaService) {
        this.cos = new COS({
            SecretId: process.env.COS_SECRET_ID || '',
            SecretKey: process.env.COS_SECRET_KEY || '',
        });
    }

    private getBucket(): string {
        return process.env.COS_BUCKET || '';
    }

    private getRegion(): string {
        return process.env.COS_REGION || 'ap-hongkong';
    }

    private getPublicDomain(): string {
        const domain = process.env.COS_PUBLIC_DOMAIN?.trim();
        if (domain) return domain.replace(/\/$/, '');
        return `https://${this.getBucket()}.cos.${this.getRegion()}.myqcloud.com`;
    }

    private getObjectUrlAsync(
        params: Parameters<COS['getObjectUrl']>[0],
    ): Promise<{ Url: string }> {
        return new Promise((resolve, reject) => {
            this.cos.getObjectUrl(params, (err: unknown, data: { Url?: string }) => {
                if (err)
                    reject(
                        err instanceof Error
                            ? err
                            : new Error(
                                (err as { message?: string }).message ?? String(err),
                            ),
                    );
                else resolve(data as { Url: string });
            });
        });
    }

    /** 生成 MP3 上传预签名 URL */
    async generateUploadUrl(fileName: string) {
        const fileId = uuidv4();
        const extension = fileName.split('.').pop() || 'mp3';
        const key = `music/${fileId}.${extension}`;

        const { Url: uploadUrl } = await this.getObjectUrlAsync({
            Bucket: this.getBucket(),
            Region: this.getRegion(),
            Key: key,
            Method: 'PUT',
            Sign: true,
            Expires: 3600,
            Headers: { 'Content-Type': 'audio/mpeg' },
        });

        const publicUrl = `${this.getPublicDomain()}/${key}`;

        return { uploadUrl, key, publicUrl };
    }

    /** 创建单条曲目 */
    async create(dto: CreateMusicTrackDto) {
        const maxOrder = await this.prisma.musicTrack.aggregate({
            _max: { order: true },
        });
        return this.prisma.musicTrack.create({
            data: {
                ...dto,
                order: (maxOrder._max.order ?? -1) + 1,
            },
        });
    }

    /** 批量创建曲目 */
    async createBatch(dtos: CreateMusicTrackDto[]) {
        const maxOrder = await this.prisma.musicTrack.aggregate({
            _max: { order: true },
        });
        let nextOrder = (maxOrder._max.order ?? -1) + 1;

        const results: Awaited<ReturnType<typeof this.prisma.musicTrack.create>>[] = [];
        for (const dto of dtos) {
            const track = await this.prisma.musicTrack.create({
                data: { ...dto, order: nextOrder++ },
            });
            results.push(track);
        }
        return results;
    }

    /** 获取所有曲目，可搜索/筛选 */
    async findAll(search?: string, category?: string) {
        const where: Record<string, unknown> = {};

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { musician: { contains: search, mode: 'insensitive' } },
                { performer: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (category && category !== 'all') {
            where.category = category;
        }

        return this.prisma.musicTrack.findMany({
            where,
            orderBy: { order: 'asc' },
        });
    }

    /** 获取单个曲目 */
    async findOne(id: string) {
        const track = await this.prisma.musicTrack.findUnique({ where: { id } });
        if (!track) throw new NotFoundException('Music track not found');
        return track;
    }

    /** 更新曲目元信息 */
    async update(id: string, dto: UpdateMusicTrackDto) {
        await this.findOne(id);
        return this.prisma.musicTrack.update({
            where: { id },
            data: dto,
        });
    }

    /** 批量更新排序 */
    async reorder(ids: string[]) {
        const updates = ids.map((id, index) =>
            this.prisma.musicTrack.update({
                where: { id },
                data: { order: index },
            }),
        );
        return this.prisma.$transaction(updates);
    }

    /** 播放计数 +1 */
    async incrementPlayCount(id: string) {
        return this.prisma.musicTrack.update({
            where: { id },
            data: { playCount: { increment: 1 } },
        });
    }

    /** 删除曲目并从 COS 移除文件 */
    async remove(id: string) {
        const track = await this.findOne(id);

        // 从 COS 删除文件（异步，不阻塞）
        this.cos.deleteObject(
            {
                Bucket: this.getBucket(),
                Region: this.getRegion(),
                Key: track.fileKey,
            },
            (err) => {
                if (err) console.error('COS delete error:', err);
            },
        );

        return this.prisma.musicTrack.delete({ where: { id } });
    }

    /** 获取所有不重复的分类 */
    async getCategories() {
        const tracks = await this.prisma.musicTrack.findMany({
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });
        return tracks.map((t) => t.category);
    }

    /** 获取所有不重复的作曲家 */
    async getMusicians() {
        const tracks = await this.prisma.musicTrack.findMany({
            select: { musician: true },
            distinct: ['musician'],
            orderBy: { musician: 'asc' },
        });
        return tracks.map((t) => t.musician);
    }
}
