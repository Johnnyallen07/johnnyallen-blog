import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMusicScoreDto } from './dto/create-music-score.dto';
import { UpdateMusicScoreDto } from './dto/update-music-score.dto';
import { I18nService } from '../i18n/i18n.service';

@Injectable()
export class MusicScoreService {
  private cos: COS;
  private readonly logger = new Logger(MusicScoreService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {
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
                  (err as { message?: string }).message ?? 'Unknown error',
                ),
          );
        else resolve(data as { Url: string });
      });
    });
  }

  /** 生成 PDF 上传预签名 URL */
  async generateUploadUrl(fileName: string) {
    const fileId = uuidv4();
    const extension = fileName.split('.').pop() || 'pdf';
    const key = `scores/${fileId}.${extension}`;

    const { Url: uploadUrl } = await this.getObjectUrlAsync({
      Bucket: this.getBucket(),
      Region: this.getRegion(),
      Key: key,
      Method: 'PUT',
      Sign: true,
      Expires: 3600,
      Headers: { 'Content-Type': 'application/pdf' },
    });

    const publicUrl = `${this.getPublicDomain()}/${key}`;

    return { uploadUrl, key, publicUrl };
  }

  /** 创建乐谱 */
  async create(dto: CreateMusicScoreDto) {
    const maxOrder = await this.prisma.musicScore.aggregate({
      _max: { order: true },
    });
    return this.prisma.musicScore.create({
      data: {
        ...dto,
        composer: dto.composer?.trim() || null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  /** 获取乐谱列表（可按乐器筛选） */
  async findAll(instrument?: string, locale?: string) {
    const where: Record<string, unknown> = {};
    if (instrument && instrument !== 'all') {
      where.instrument = instrument;
    }

    const data = await this.prisma.musicScore.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return this.i18n.localize('musicScore', data, locale);
  }

  /** 获取单个乐谱 */
  async findOne(id: string, locale?: string) {
    const score = await this.prisma.musicScore.findUnique({ where: { id } });
    if (!score) throw new NotFoundException('Music score not found');
    return this.i18n.localizeOne('musicScore', score, locale);
  }

  /** 更新乐谱 */
  async update(id: string, dto: UpdateMusicScoreDto) {
    const existing = await this.findOne(id);

    // 如果文件 key 变了，删除旧的 COS 文件
    if (dto.fileKey && dto.fileKey !== existing.fileKey) {
      this.cos.deleteObject(
        {
          Bucket: this.getBucket(),
          Region: this.getRegion(),
          Key: existing.fileKey,
        },
        (err) => {
          if (err) this.logger.error('COS delete old score file error:', err);
          else
            this.logger.log(`Deleted old COS score file: ${existing.fileKey}`);
        },
      );
    }

    return this.prisma.musicScore.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.composer !== undefined
          ? { composer: dto.composer?.trim() || null }
          : {}),
      },
    });
  }

  /** 删除乐谱（包含从 COS 删除文件） */
  async remove(id: string) {
    const score = await this.findOne(id);

    this.cos.deleteObject(
      {
        Bucket: this.getBucket(),
        Region: this.getRegion(),
        Key: score.fileKey,
      },
      (err) => {
        if (err) this.logger.error('COS delete score file error:', err);
      },
    );

    return this.prisma.musicScore.delete({ where: { id } });
  }
}
