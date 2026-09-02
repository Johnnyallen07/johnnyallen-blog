import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MomentCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteSyncDto,
  CreateMomentCategoryDto,
  CreateSyncTokenDto,
  CreateUploadUrlDto,
  MomentBrowserQueryDto,
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

  private cleanName(name: string) {
    const value = name.trim();
    if (!value || value === '.' || value === '..' || /[\\/\0]/.test(value))
      throw new BadRequestException('名称不能为空，也不能包含斜杠');
    return value;
  }

  private cleanPath(path: string) {
    const parts = path
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map((part) => this.cleanName(part));
    if (!parts.length) throw new BadRequestException('文件路径无效');
    return parts.join('/');
  }

  async catalog(query: MomentCatalogQueryDto, access: 'public' | 'admin') {
    const where: Prisma.MomentAssetWhereInput = {
      status: 'READY',
      trashedAt: null,
    };
    if (access === 'public') where.visibility = 'PUBLIC';
    else if (query.visibility === 'public') where.visibility = 'PUBLIC';
    else if (query.visibility === 'private') where.visibility = 'PRIVATE';
    if (query.category) where.categoryId = query.category;
    if (query.type === 'photo') where.mimeType = { startsWith: 'image/' };
    if (query.type === 'video') where.mimeType = { startsWith: 'video/' };
    if (query.type === 'file')
      where.NOT = [
        { mimeType: { startsWith: 'image/' } },
        { mimeType: { startsWith: 'video/' } },
      ];
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
        where: { trashedAt: null },
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
        trashedAt: null,
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
      where: { trashedAt: null },
      include: {
        _count: { select: { assets: { where: { trashedAt: null } } } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  private async assertUniqueFolderName(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.momentCategory.findFirst({
      where: {
        parentId,
        trashedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new BadRequestException('当前目录中已存在同名文件夹');
  }

  async createCategory(dto: CreateMomentCategoryDto) {
    const name = this.cleanName(dto.name);
    const parentId = dto.parentId || null;
    if (parentId) await this.folder(parentId);
    await this.assertUniqueFolderName(name, parentId);
    return this.prisma.momentCategory.create({
      data: {
        name,
        parentId,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        order: dto.order,
      },
    });
  }

  private async descendants(id: string) {
    const all = await this.prisma.momentCategory.findMany();
    const ids = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of all) {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
      }
    }
    return [...ids];
  }

  private async folderPath(id: string | null) {
    if (!id) return '';
    const all = await this.prisma.momentCategory.findMany();
    const map = new Map(all.map((item) => [item.id, item]));
    const names: string[] = [];
    const seen = new Set<string>();
    let current = map.get(id);
    while (current) {
      if (seen.has(current.id))
        throw new BadRequestException('文件夹层级存在循环');
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
    return names.join('/');
  }

  async updateCategory(id: string, dto: UpdateMomentCategoryDto) {
    const current = await this.folder(id);
    const name =
      dto.name === undefined ? current.name : this.cleanName(dto.name);
    const parentId =
      dto.parentId === undefined ? current.parentId : dto.parentId || null;
    if (parentId) {
      const family = await this.descendants(id);
      if (family.includes(parentId))
        throw new BadRequestException('不能把文件夹移动到自身内部');
      await this.folder(parentId);
    }
    await this.assertUniqueFolderName(name, parentId, id);
    const oldPrefix = await this.folderPath(id);
    const updated = await this.prisma.momentCategory.update({
      where: { id },
      data: {
        name,
        parentId,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        order: dto.order,
      },
    });
    const newPrefix = await this.folderPath(id);
    if (oldPrefix !== newPrefix) {
      const family = await this.descendants(id);
      const assets = await this.prisma.momentAsset.findMany({
        where: { categoryId: { in: family } },
      });
      await this.prisma.$transaction(
        assets.map((asset) =>
          this.prisma.momentAsset.update({
            where: { id: asset.id },
            data: {
              relativePath: `${newPrefix}${asset.relativePath.slice(oldPrefix.length)}`,
            },
          }),
        ),
      );
    }
    return updated;
  }

  async deleteCategory(id: string, actor = 'admin') {
    const ids = await this.descendants(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.momentCategory.updateMany({
        where: { id: { in: ids } },
        data: { trashedAt: now },
      }),
      this.prisma.momentAsset.updateMany({
        where: { categoryId: { in: ids } },
        data: { trashedAt: now },
      }),
    ]);
    await this.audit(actor, 'FOLDER_TRASHED', undefined, { folderId: id });
    return { trashed: true };
  }

  async restoreCategory(id: string, actor: string) {
    const current = await this.prisma.momentCategory.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('文件夹不存在');
    await this.assertUniqueFolderName(current.name, current.parentId, id);
    const ids = await this.descendants(id);
    await this.prisma.$transaction([
      this.prisma.momentCategory.updateMany({
        where: { id: { in: ids } },
        data: { trashedAt: null },
      }),
      this.prisma.momentAsset.updateMany({
        where: { categoryId: { in: ids } },
        data: { trashedAt: null },
      }),
    ]);
    await this.audit(actor, 'FOLDER_RESTORED', undefined, { folderId: id });
    return { restored: true };
  }

  async permanentlyDeleteCategory(id: string, actor: string) {
    const ids = await this.descendants(id);
    const assets = await this.prisma.momentAsset.findMany({
      where: { categoryId: { in: ids } },
    });
    for (const asset of assets)
      await this.storage.deleteObject(asset.objectKey);
    await this.prisma.$transaction([
      this.prisma.momentAsset.deleteMany({
        where: { id: { in: assets.map((item) => item.id) } },
      }),
      this.prisma.momentCategory.delete({ where: { id } }),
    ]);
    await this.audit(actor, 'FOLDER_PERMANENTLY_DELETED', undefined, {
      folderId: id,
      objects: assets.length,
    });
    return { deleted: true, objectsDeleted: assets.length };
  }

  private async folder(id: string) {
    const folder = await this.prisma.momentCategory.findFirst({
      where: { id, trashedAt: null },
    });
    if (!folder) throw new NotFoundException('文件夹不存在');
    return folder;
  }

  async browser(query: MomentBrowserQueryDto) {
    const folderId = query.folderId || null;
    if (folderId && !query.trash) await this.folder(folderId);
    const trashedAt = query.trash ? { not: null } : null;
    const folderWhere: Prisma.MomentCategoryWhereInput = query.q?.trim()
      ? { trashedAt, name: { contains: query.q.trim(), mode: 'insensitive' } }
      : { parentId: folderId, trashedAt };
    const assetWhere: Prisma.MomentAssetWhereInput = query.q?.trim()
      ? {
          trashedAt,
          OR: [
            { originalName: { contains: query.q.trim(), mode: 'insensitive' } },
            { title: { contains: query.q.trim(), mode: 'insensitive' } },
            { relativePath: { contains: query.q.trim(), mode: 'insensitive' } },
          ],
        }
      : { categoryId: folderId, trashedAt };
    const [folders, assets] = await Promise.all([
      this.prisma.momentCategory.findMany({
        where: folderWhere,
        include: { _count: { select: { assets: true, children: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.momentAsset.findMany({
        where: assetWhere,
        orderBy: { originalName: 'asc' },
      }),
    ]);
    const breadcrumbs: Pick<MomentCategory, 'id' | 'name'>[] = [];
    if (folderId) {
      const all = await this.prisma.momentCategory.findMany();
      const map = new Map(all.map((item) => [item.id, item]));
      let current = map.get(folderId);
      while (current) {
        breadcrumbs.unshift({ id: current.id, name: current.name });
        current = current.parentId ? map.get(current.parentId) : undefined;
      }
    }
    return {
      folderId,
      breadcrumbs,
      folders,
      assets: assets.map((item) => this.serializeAsset(item)),
    };
  }

  async updateAsset(id: string, dto: UpdateMomentAssetDto, actor: string) {
    const current = await this.prisma.momentAsset.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('文件不存在');
    const originalName = dto.originalName
      ? this.cleanName(dto.originalName)
      : current.originalName;
    const folderId =
      dto.categoryId === undefined
        ? current.categoryId
        : dto.categoryId || null;
    if (folderId) await this.folder(folderId);
    const folderPath = await this.folderPath(folderId);
    const relativePath = folderPath
      ? `${folderPath}/${originalName}`
      : originalName;
    const conflict = await this.prisma.momentAsset.findFirst({
      where: { relativePath, trashedAt: null, id: { not: id } },
    });
    if (conflict) throw new BadRequestException('目标目录中已存在同名文件');
    const data: Prisma.MomentAssetUncheckedUpdateInput = {
      originalName,
      relativePath,
      title: dto.title,
      description: dto.description,
      categoryId: folderId,
      tags: dto.tags,
      visibility: dto.visibility,
      featured: dto.featured,
      status: dto.status,
      capturedAt:
        dto.capturedAt === null
          ? null
          : dto.capturedAt
            ? new Date(dto.capturedAt)
            : undefined,
    };
    const asset = await this.prisma.momentAsset.update({ where: { id }, data });
    await this.audit(actor, 'ASSET_UPDATED', id, { fields: Object.keys(dto) });
    return this.serializeAsset(asset);
  }

  async trashAsset(id: string, actor: string) {
    await this.prisma.momentAsset.update({
      where: { id },
      data: { trashedAt: new Date() },
    });
    await this.audit(actor, 'ASSET_TRASHED', id);
    return { trashed: true };
  }

  async restoreAsset(id: string, actor: string) {
    const asset = await this.prisma.momentAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('文件不存在');
    const conflict = await this.prisma.momentAsset.findFirst({
      where: {
        relativePath: asset.relativePath,
        trashedAt: null,
        id: { not: id },
      },
    });
    if (conflict)
      throw new BadRequestException('原目录已有同名文件，请先重命名现有文件');
    await this.prisma.momentAsset.update({
      where: { id },
      data: { trashedAt: null },
    });
    await this.audit(actor, 'ASSET_RESTORED', id);
    return { restored: true };
  }

  async permanentlyDeleteAsset(id: string, actor: string) {
    const asset = await this.prisma.momentAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('文件不存在');
    await this.storage.deleteObject(asset.objectKey);
    await this.prisma.momentAsset.delete({ where: { id } });
    await this.audit(actor, 'ASSET_PERMANENTLY_DELETED', id, {
      objectKey: asset.objectKey,
    });
    return { deleted: true };
  }

  async assetUrl(id: string, download = false) {
    const asset = await this.prisma.momentAsset.findFirst({
      where: { id, trashedAt: null },
    });
    if (!asset) throw new NotFoundException('文件不存在');
    return {
      url: await this.storage.createDownloadUrl(
        asset.objectKey,
        asset.originalName,
        download,
      ),
      expiresIn: 300,
    };
  }

  async folderExport(id: string) {
    const ids = await this.descendants(id);
    const prefix = await this.folderPath(id);
    const assets = await this.prisma.momentAsset.findMany({
      where: { categoryId: { in: ids }, trashedAt: null },
      orderBy: { relativePath: 'asc' },
    });
    return {
      folderName: prefix.split('/').pop(),
      items: assets.map((asset) => ({
        id: asset.id,
        path: asset.relativePath.slice(prefix.length + 1),
        size: asset.size.toString(),
      })),
    };
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
      where: { status: 'READY', trashedAt: null },
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
    const relativePath = this.cleanPath(dto.relativePath);
    const existing = await this.prisma.momentAsset.findFirst({
      where: {
        relativePath,
        checksum: dto.checksum.toLowerCase(),
        status: 'READY',
        trashedAt: null,
      },
    });
    if (existing) return { exists: true, assetId: existing.id, verified: true };
    const objectKey = this.storage.createObjectKey(relativePath);
    const uploadUrl = await this.storage.createUploadUrl(
      objectKey,
      dto.mimeType,
      dto.checksum,
    );
    return {
      exists: false,
      objectKey,
      uploadUrl,
      expiresIn: 900,
      requiredHeaders: {
        'Content-Type': dto.mimeType,
        'x-cos-meta-sha256': dto.checksum.toLowerCase(),
      },
    };
  }

  private async ensureFolderPath(parts: string[]) {
    let parentId: string | null = null;
    for (const raw of parts) {
      const name = this.cleanName(raw);
      let folder: MomentCategory | null =
        await this.prisma.momentCategory.findFirst({
          where: {
            parentId,
            trashedAt: null,
            name: { equals: name, mode: 'insensitive' },
          },
        });
      if (!folder)
        folder = await this.prisma.momentCategory.create({
          data: { name, parentId },
        });
      parentId = folder.id;
    }
    return parentId;
  }

  async completeSync(dto: CompleteSyncDto, actor: string) {
    const relativePath = this.cleanPath(dto.relativePath);
    const size = BigInt(dto.size);
    try {
      await this.storage.verifyObject(dto.objectKey, size, dto.checksum);
    } catch (error) {
      await this.storage.deleteObject(dto.objectKey).catch(() => undefined);
      throw error;
    }
    const parts = relativePath.split('/');
    const originalName = parts.pop()!;
    const categoryId = await this.ensureFolderPath(parts);
    const checksum = dto.checksum.toLowerCase();
    const exact = await this.prisma.momentAsset.findFirst({
      where: { relativePath, checksum, trashedAt: null },
    });
    if (exact) {
      if (exact.objectKey !== dto.objectKey)
        await this.storage.deleteObject(dto.objectKey);
      return { ...this.serializeAsset(exact), verified: true };
    }
    const replaced = await this.prisma.momentAsset.findFirst({
      where: { relativePath, trashedAt: null },
    });
    const asset = replaced
      ? await this.prisma.momentAsset.update({
          where: { id: replaced.id },
          data: {
            objectKey: dto.objectKey,
            checksum,
            originalName,
            mimeType: dto.mimeType,
            size,
            categoryId,
            status: 'READY',
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
            width: dto.width,
            height: dto.height,
          },
        })
      : await this.prisma.momentAsset.create({
          data: {
            objectKey: dto.objectKey,
            checksum,
            originalName,
            relativePath,
            mimeType: dto.mimeType,
            size,
            categoryId,
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
            width: dto.width,
            height: dto.height,
            tags: [],
          },
        });
    if (replaced && replaced.objectKey !== dto.objectKey)
      await this.storage.deleteObject(replaced.objectKey);
    await this.audit(actor, 'SYNC_COMPLETED', asset.id, {
      relativePath,
      verified: true,
      replaced: Boolean(replaced),
    });
    return { ...this.serializeAsset(asset), verified: true };
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
