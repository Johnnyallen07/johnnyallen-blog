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
              : new Error((err as { message?: string }).message ?? String(err)),
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
              : new Error((err as { message?: string }).message ?? String(err)),
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
    const key = `${fileId}.${extension}`;

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

  async saveMediaReference(key: string, url: string, type: 'IMAGE' | 'VIDEO') {
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
