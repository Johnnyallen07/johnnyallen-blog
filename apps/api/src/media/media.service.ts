import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { Readable } from 'stream';

@Injectable()
export class MediaService {
  private cos: COS;

  constructor(private prisma: PrismaService) {
    this.cos = new COS({
      SecretId: process.env.COS_SECRET_ID || '',
      SecretKey: process.env.COS_SECRET_KEY || '',
    });
  }

  private getBucket(): string {
    const bucket = process.env.COS_BUCKET;
    if (!bucket) {
      throw new InternalServerErrorException('COS_BUCKET is not configured');
    }
    return bucket;
  }

  private getRegion(): string {
    return process.env.COS_REGION || 'ap-hongkong';
  }

  /**
   * 用于前端展示/引用图片的公网地址。
   * 若配置了 COS_PUBLIC_DOMAIN 则使用（需该域名已绑定有效 HTTPS 证书，否则会 ERR_CERT_COMMON_NAME_INVALID）；
   * 未配置时使用腾讯云默认 COS 域名，证书有效，图片可正常加载。
   */
  private getPublicDomain(): string {
    const domain = process.env.COS_PUBLIC_DOMAIN?.trim();
    if (domain) {
      return domain.replace(/\/$/, '');
    }
    const bucket = this.getBucket();
    const region = this.getRegion();
    return `https://${bucket}.cos.${region}.myqcloud.com`;
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

  private getObjectAsync(params: Parameters<COS['getObject']>[0]): Promise<{
    Body: Readable | Buffer;
    headers?: { 'content-type'?: string };
  }> {
    return new Promise((resolve, reject) => {
      void this.cos.getObject(params, (err: unknown, data: unknown) => {
        if (err)
          reject(
            err instanceof Error
              ? err
              : new Error(
                  (err as { message?: string }).message ?? 'Unknown error',
                ),
          );
        else
          resolve(
            data as {
              Body: Readable | Buffer;
              headers?: { 'content-type'?: string };
            },
          );
      });
    });
  }

  async generatePresignedUrl(fileName: string, contentType: string) {
    const fileId = uuidv4();
    const extension = fileName.split('.').pop();
    const key = `assets/${fileId}.${extension}`;

    try {
      const { Url: uploadUrl } = await this.getObjectUrlAsync({
        Bucket: this.getBucket(),
        Region: this.getRegion(),
        Key: key,
        Method: 'PUT',
        Sign: true,
        Expires: 3600,
        Headers: contentType ? { 'Content-Type': contentType } : undefined,
      });

      const publicUrl = `${this.getPublicDomain()}/${key}`;

      return {
        uploadUrl,
        key,
        publicUrl,
      };
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw new InternalServerErrorException('Could not generate upload URL');
    }
  }

  private deleteObjectAsync(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cos.deleteObject(
        {
          Bucket: this.getBucket(),
          Region: this.getRegion(),
          Key: key,
        },
        (err) => {
          if (err) {
            reject(
              err instanceof Error
                ? err
                : new Error(
                    (err as { message?: string }).message ?? 'COS delete error',
                  ),
            );
          } else {
            resolve();
          }
        },
      );
    });
  }

  getDownloadUrl(key: string): string {
    return `${this.getPublicDomain()}/${key}`;
  }

  extractMediaRefsFromHtml(html?: string | null): {
    key: string;
    url: string;
    type: 'IMAGE' | 'VIDEO' | 'FILE';
  }[] {
    if (!html) return [];

    const refs = new Map<
      string,
      { key: string; url: string; type: 'IMAGE' | 'VIDEO' | 'FILE' }
    >();
    const publicDomain = this.getPublicDomain();

    const addRef = (
      rawUrl: string | undefined,
      type: 'IMAGE' | 'VIDEO' | 'FILE',
      rawKey?: string,
    ) => {
      const key = rawKey || this.extractKeyFromUrl(rawUrl, publicDomain);
      if (!key || !key.startsWith('assets/')) return;
      refs.set(key, {
        key,
        url: rawUrl || `${publicDomain}/${key}`,
        type,
      });
    };

    for (const match of html.matchAll(
      /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    )) {
      addRef(match[1], 'IMAGE');
    }

    for (const match of html.matchAll(
      /<video\b[^>]*(?:\bsrc=["']([^"']+)["'])?[^>]*>[\s\S]*?<\/video>/gi,
    )) {
      const block = match[0];
      const source = block.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i);
      addRef(match[1] || source?.[1], 'VIDEO');
    }

    for (const match of html.matchAll(
      /<a\b[^>]*\bdata-attachment=["']true["'][^>]*>/gi,
    )) {
      const tag = match[0];
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      const key = tag.match(/\bdata-key=["']([^"']+)["']/i)?.[1];
      addRef(href, 'FILE', key);
    }

    return [...refs.values()];
  }

  async syncPostMedia(postId: string, html?: string | null) {
    const refs = this.extractMediaRefsFromHtml(html);

    // Post updates can temporarily remove media while the editor is autosaving
    // or while content is being copied around. Keep COS objects intact here and
    // only sync relational references.
    await this.prisma.media.deleteMany({ where: { postId } });
    if (refs.length === 0) return;

    await this.prisma.media.createMany({
      data: refs.map((ref) => ({
        postId,
        key: ref.key,
        url: ref.url,
        type: ref.type,
      })),
      skipDuplicates: true,
    });
  }

  async deleteUnreferencedMediaObjects(keys: string[]) {
    const uniqueKeys = [...new Set(keys)].filter((key) =>
      key?.startsWith('assets/'),
    );
    if (uniqueKeys.length === 0) return;

    const mediaRefs = await this.prisma.media.findMany({
      where: {
        key: { in: uniqueKeys },
        postId: { not: null },
      },
      select: { key: true },
    });

    const referencedKeys = new Set(mediaRefs.map((media) => media.key));
    const keysToCheckInContent = uniqueKeys.filter(
      (key) => !referencedKeys.has(key),
    );

    if (keysToCheckInContent.length > 0) {
      const posts = await this.prisma.post.findMany({
        where: {
          OR: keysToCheckInContent.map((key) => ({
            content: { contains: key },
          })),
        },
        select: { content: true },
      });

      for (const key of keysToCheckInContent) {
        if (posts.some((post) => post.content?.includes(key))) {
          referencedKeys.add(key);
        }
      }
    }

    await this.deleteMediaObjects(
      uniqueKeys.filter((key) => !referencedKeys.has(key)),
    );
  }

  async deleteMediaObjects(keys: string[]) {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    await Promise.allSettled(
      uniqueKeys.map((key) => this.deleteObjectAsync(key)),
    );
  }

  private extractKeyFromUrl(url: string | undefined, publicDomain: string) {
    if (!url) return null;
    try {
      if (url.startsWith(publicDomain)) {
        return decodeURIComponent(url.slice(publicDomain.length + 1));
      }
      const parsed = new URL(url, 'http://local');
      const pathname = parsed.pathname.replace(/^\/+/, '');
      if (pathname.startsWith('media/download/')) {
        return decodeURIComponent(pathname.replace(/^media\/download\//, ''));
      }
      if (pathname.startsWith('media/')) {
        return decodeURIComponent(pathname.replace(/^media\//, ''));
      }
      if (pathname.startsWith('assets/')) {
        return decodeURIComponent(pathname);
      }
    } catch {
      return null;
    }
    return null;
  }

  async saveMediaReference(
    key: string,
    url: string,
    type: 'IMAGE' | 'VIDEO' | 'FILE',
  ) {
    return this.prisma.media.create({
      data: {
        key,
        url,
        type,
      },
    });
  }

  async getMedia(key: string) {
    try {
      const data = await this.getObjectAsync({
        Bucket: this.getBucket(),
        Region: this.getRegion(),
        Key: key,
      });
      const body = data.Body;
      const stream =
        body instanceof Buffer ? Readable.from(body) : (body as Readable);
      return {
        stream,
        contentType:
          data.headers?.['content-type'] || 'application/octet-stream',
      };
    } catch (error) {
      console.error('Error getting object from COS:', error);
      throw new NotFoundException('File not found');
    }
  }
}
