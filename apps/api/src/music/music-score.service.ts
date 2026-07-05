import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMusicScoreDto } from './dto/create-music-score.dto';
import { UpdateMusicScoreDto } from './dto/update-music-score.dto';
import { ScorePageDto } from './dto/score-page.dto';
import { I18nService } from '../i18n/i18n.service';

/** 允许上传的乐谱文件类型 → COS 对象扩展名 */
const SCORE_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// type（而非 interface）：隐式索引签名才能赋给 Prisma 的 InputJsonValue
type ScorePage = {
  key: string;
  url: string;
  size?: number;
};

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

  /** 生成上传预签名 URL（PDF 或图片，PUT 时的 Content-Type 必须与签名一致） */
  async generateUploadUrl(fileName: string, contentType = 'application/pdf') {
    const extension = SCORE_CONTENT_TYPES[contentType];
    if (!extension) {
      throw new BadRequestException(`不支持的文件类型: ${contentType}`);
    }
    const key = `scores/${uuidv4()}.${extension}`;

    const { Url: uploadUrl } = await this.getObjectUrlAsync({
      Bucket: this.getBucket(),
      Region: this.getRegion(),
      Key: key,
      Method: 'PUT',
      Sign: true,
      Expires: 3600,
      Headers: { 'Content-Type': contentType },
    });

    const publicUrl = `${this.getPublicDomain()}/${key}`;

    return { uploadUrl, key, publicUrl };
  }

  /** 批量生成上传预签名 URL（图片乐谱一次传多页） */
  async generateUploadUrls(
    files: { fileName: string; contentType: string }[],
  ) {
    return Promise.all(
      files.map((file) =>
        this.generateUploadUrl(file.fileName, file.contentType),
      ),
    );
  }

  /** 解析 DB 里的 pages JSON（容错：非法结构按空处理） */
  private parsePages(value: unknown): ScorePage[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (page): page is ScorePage =>
        !!page &&
        typeof page === 'object' &&
        typeof (page as ScorePage).key === 'string' &&
        typeof (page as ScorePage).url === 'string',
    );
  }

  /** DTO 页面 → 存库的纯对象（剥掉 class 实例/多余字段） */
  private toPlainPages(pages: ScorePageDto[]): ScorePage[] {
    return pages.map((page) => ({
      key: page.key,
      url: page.url,
      ...(typeof page.size === 'number' ? { size: page.size } : {}),
    }));
  }

  /** 静默删除 COS 对象（失败只记日志，不阻塞主流程） */
  private deleteObjectQuiet(key: string) {
    if (!key) return;
    this.cos.deleteObject(
      {
        Bucket: this.getBucket(),
        Region: this.getRegion(),
        Key: key,
      },
      (err) => {
        if (err) this.logger.error(`COS delete error (${key}):`, err);
        else this.logger.log(`Deleted COS object: ${key}`);
      },
    );
  }

  /** 创建乐谱 */
  async create(dto: CreateMusicScoreDto) {
    if (dto.fileType === 'images' && !dto.pages?.length) {
      throw new BadRequestException('图片乐谱必须包含至少一页');
    }
    const maxOrder = await this.prisma.musicScore.aggregate({
      _max: { order: true },
    });
    const { pages, ...rest } = dto;
    return this.prisma.musicScore.create({
      data: {
        ...rest,
        composer: dto.composer?.trim() || null,
        ...(pages ? { pages: this.toPlainPages(pages) } : {}),
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

  /** 更新乐谱（图片乐谱可整组更新 pages：排序/删页/加页） */
  async update(id: string, dto: UpdateMusicScoreDto) {
    const existing = await this.findOne(id);

    const { pages: dtoPages, ...rest } = dto;
    const data: Prisma.MusicScoreUpdateInput = { ...rest };
    if (dto.composer !== undefined) {
      data.composer = dto.composer?.trim() || null;
    }

    if (dtoPages) {
      const pages = this.toPlainPages(dtoPages);
      const keptKeys = new Set(pages.map((page) => page.key));

      // 被移除的页面从 COS 删除（仅当新列表里确实不再引用）
      for (const page of this.parsePages(existing.pages)) {
        if (!keptKeys.has(page.key)) this.deleteObjectQuiet(page.key);
      }

      // fileKey/fileUrl/封面 跟随第一页，页数/大小同步
      const first = pages[0];
      data.pages = pages;
      data.pageCount = pages.length;
      data.fileKey = first.key;
      data.fileUrl = first.url;
      data.coverUrl = first.url;
      if (pages.every((page) => typeof page.size === 'number')) {
        data.fileSize = pages.reduce((sum, page) => sum + (page.size ?? 0), 0);
      }
    } else if (dto.fileKey && dto.fileKey !== existing.fileKey) {
      // PDF 换文件：删除旧的 COS 文件
      this.deleteObjectQuiet(existing.fileKey);
    }

    return this.prisma.musicScore.update({ where: { id }, data });
  }

  /** 删除乐谱（包含从 COS 删除文件；图片乐谱删除全部页面） */
  async remove(id: string) {
    const score = await this.findOne(id);

    const keys = new Set<string>([score.fileKey]);
    for (const page of this.parsePages(score.pages)) {
      keys.add(page.key);
    }
    keys.forEach((key) => this.deleteObjectQuiet(key));

    return this.prisma.musicScore.delete({ where: { id } });
  }
}
