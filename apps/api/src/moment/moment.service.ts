import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteSyncDto,
  CreateMomentCategoryDto,
  CreateSyncTokenDto,
  CreateUploadUrlDto,
  MomentCatalogQueryDto,
  UpdateMomentAssetDto,
  UpdateMomentCategoryDto,
} from './dto/moment.dto';
import { randomToken, sha256 } from './moment-crypto';
import { MomentStorageService } from './moment-storage.service';

@Injectable()
export class MomentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MomentStorageService,
  ) {}

  private serializeAsset<T extends { size: bigint }>(asset: T) {
    return { ...asset, size: asset.size.toString() };
  }

  async catalog(query: MomentCatalogQueryDto, access: 'public' | 'admin') {
    const where: Prisma.MomentAssetWhereInput = { status: 'READY' };
    if (access === 'public') where.visibility = 'PUBLIC';
    else if (query.visibility === 'public') where.visibility = 'PUBLIC';
    else if (query.visibility === 'private') where.visibility = 'PRIVATE';
    if (query.category) where.categoryId = query.category;
    if (query.type === 'photo') where.mimeType = { startsWith: 'image/' };
    if (query.type === 'video') where.mimeType = { startsWith: 'video/' };
    if (query.type === 'file') {
      where.NOT = [
        { mimeType: { startsWith: 'image/' } },
        { mimeType: { startsWith: 'video/' } },
      ];
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { originalName: { contains: q, mode: 'insensitive' } },
        { relativePath: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total, categories] = await this.prisma.$transaction([
      this.prisma.momentAsset.findMany({
        where,
        include: { category: true },
        orderBy: [
          { featured: 'desc' },
          { capturedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: query.limit,
      }),
      this.prisma.momentAsset.count({ where }),
      this.prisma.momentCategory.findMany({
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return {
      items: items.map((item) => this.serializeAsset(item)),
      categories,
      total,
      page: query.page,
      pages: Math.max(1, Math.ceil(total / query.limit)),
      access,
    };
  }

  async assetForContent(id: string, access: 'public' | 'admin') {
    const asset = await this.prisma.momentAsset.findFirst({
      where: {
        id,
        status: 'READY',
        ...(access === 'public' ? { visibility: 'PUBLIC' as const } : {}),
      },
    });
    if (!asset) throw new NotFoundException('文件不存在');
    return asset;
  }

  auditContent(actor: string, assetId: string, action: 'VIEW' | 'DOWNLOAD') {
    return this.audit(actor, action, assetId);
  }

  categories() {
    return this.prisma.momentCategory.findMany({
      include: { _count: { select: { assets: true } } },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  createCategory(dto: CreateMomentCategoryDto) {
    return this.prisma.momentCategory.create({ data: dto });
  }

  updateCategory(id: string, dto: UpdateMomentCategoryDto) {
    return this.prisma.momentCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    const used = await this.prisma.momentAsset.count({
      where: { categoryId: id },
    });
    if (used) throw new BadRequestException('分类中仍有文件，无法删除');
    await this.prisma.momentCategory.delete({ where: { id } });
    return { deleted: true };
  }

  async updateAsset(id: string, dto: UpdateMomentAssetDto, actor: string) {
    const data: Prisma.MomentAssetUpdateInput = {
      ...dto,
      capturedAt:
        dto.capturedAt === null
          ? null
          : dto.capturedAt
            ? new Date(dto.capturedAt)
            : undefined,
      category:
        dto.categoryId === null
          ? { disconnect: true }
          : dto.categoryId
            ? { connect: { id: dto.categoryId } }
            : undefined,
    };
    delete (data as Record<string, unknown>).categoryId;
    const asset = await this.prisma.momentAsset.update({ where: { id }, data });
    await this.audit(actor, 'ASSET_UPDATED', id, { fields: Object.keys(dto) });
    return this.serializeAsset(asset);
  }

  async createSyncToken(dto: CreateSyncTokenDto, actor: string) {
    const token = `mom_sync_${randomToken()}`;
    const record = await this.prisma.momentSyncToken.create({
      data: {
        label: dto.label,
        tokenHash: sha256(token),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.audit(actor, 'SYNC_TOKEN_CREATED', undefined, {
      tokenId: record.id,
      label: dto.label,
    });
    return { ...record, tokenHash: undefined, token };
  }

  syncTokens() {
    return this.prisma.momentSyncToken.findMany({
      select: {
        id: true,
        label: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSyncToken(id: string, actor: string) {
    await this.prisma.momentSyncToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.audit(actor, 'SYNC_TOKEN_REVOKED', undefined, { tokenId: id });
    return { revoked: true };
  }

  async manifest() {
    const items = await this.prisma.momentAsset.findMany({
      where: { status: 'READY' },
      select: {
        relativePath: true,
        checksum: true,
        size: true,
        updatedAt: true,
      },
    });
    return { items: items.map((item) => this.serializeAsset(item)) };
  }

  async createUploadUrl(dto: CreateUploadUrlDto) {
    const existing = await this.prisma.momentAsset.findFirst({
      where: {
        relativePath: dto.relativePath,
        checksum: dto.checksum.toLowerCase(),
        status: 'READY',
      },
    });
    if (existing) return { exists: true, assetId: existing.id };
    const objectKey = this.storage.createObjectKey(dto.relativePath);
    const uploadUrl = await this.storage.createUploadUrl(
      objectKey,
      dto.mimeType,
    );
    return { exists: false, objectKey, uploadUrl, expiresIn: 900 };
  }

  async completeSync(dto: CompleteSyncDto, actor: string) {
    const size = BigInt(dto.size);
    await this.storage.assertObject(dto.objectKey, size);
    const category = dto.categorySlug
      ? await this.prisma.momentCategory.findUnique({
          where: { slug: dto.categorySlug },
        })
      : null;
    const originalName = dto.relativePath.split('/').pop() || dto.relativePath;
    const asset = await this.prisma.momentAsset.upsert({
      where: {
        relativePath_checksum: {
          relativePath: dto.relativePath,
          checksum: dto.checksum.toLowerCase(),
        },
      },
      create: {
        objectKey: dto.objectKey,
        checksum: dto.checksum.toLowerCase(),
        originalName,
        relativePath: dto.relativePath,
        mimeType: dto.mimeType,
        size,
        categoryId: category?.id,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
        width: dto.width,
        height: dto.height,
        tags: [],
      },
      update: { status: 'READY', categoryId: category?.id },
    });
    await this.audit(actor, 'SYNC_COMPLETED', asset.id, {
      relativePath: dto.relativePath,
    });
    return this.serializeAsset(asset);
  }

  private audit(
    actor: string,
    action: string,
    assetId?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.momentAuditLog.create({
      data: { actor, action, assetId, metadata },
    });
  }
}
