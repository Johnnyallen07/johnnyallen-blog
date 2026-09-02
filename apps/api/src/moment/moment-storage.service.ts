import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

@Injectable()
export class MomentStorageService {
  private readonly cos: COS;

  constructor(private readonly config: ConfigService) {
    this.cos = new COS({
      SecretId: this.config.get<string>('COS_SECRET_ID', ''),
      SecretKey: this.config.get<string>('COS_SECRET_KEY', ''),
    });
  }

  private bucket(): string {
    const value = this.config.get<string>('COS_BUCKET');
    if (!value)
      throw new InternalServerErrorException('COS_BUCKET is not configured');
    return value;
  }

  private region(): string {
    return this.config.get<string>('COS_REGION', 'ap-hongkong');
  }

  createObjectKey(relativePath: string): string {
    const name = relativePath.split('/').pop() || 'file';
    const safeExtension = name
      .match(/\.([a-zA-Z0-9]{1,12})$/)?.[1]
      ?.toLowerCase();
    return `moment/vault/${randomUUID()}${safeExtension ? `.${safeExtension}` : ''}`;
  }

  async createUploadUrl(objectKey: string, mimeType: string) {
    return new Promise<string>((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket(),
          Region: this.region(),
          Key: objectKey,
          Method: 'PUT',
          Sign: true,
          Expires: 900,
          Headers: { 'Content-Type': mimeType },
        },
        (error, data) => {
          if (error || !data?.Url)
            reject(
              error instanceof Error
                ? error
                : new Error(error?.message || 'Missing upload URL'),
            );
          else resolve(data.Url);
        },
      );
    });
  }

  async assertObject(objectKey: string, expectedSize: bigint) {
    if (!objectKey.startsWith('moment/vault/'))
      throw new NotFoundException('文件不存在');
    const data = await new Promise<{ headers?: { 'content-length'?: string } }>(
      (resolve, reject) => {
        this.cos.headObject(
          { Bucket: this.bucket(), Region: this.region(), Key: objectKey },
          (error, result) =>
            error
              ? reject(
                  error instanceof Error
                    ? error
                    : new Error(error.message || 'COS headObject failed'),
                )
              : resolve(result),
        );
      },
    ).catch(() => {
      throw new NotFoundException('COS 文件不存在或上传尚未完成');
    });
    const actual = data.headers?.['content-length'];
    if (actual && BigInt(actual) !== expectedSize) {
      throw new NotFoundException('COS 文件大小与同步记录不一致');
    }
  }

  async getObject(objectKey: string): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: string;
  }> {
    if (!objectKey.startsWith('moment/vault/'))
      throw new NotFoundException('文件不存在');
    const data = await new Promise<{
      Body: Readable | Buffer;
      headers?: { 'content-type'?: string; 'content-length'?: string };
    }>((resolve, reject) => {
      this.cos.getObject(
        { Bucket: this.bucket(), Region: this.region(), Key: objectKey },
        (error, result) =>
          error
            ? reject(
                error instanceof Error
                  ? error
                  : new Error(error.message || 'COS getObject failed'),
              )
            : resolve(
                result as {
                  Body: Readable | Buffer;
                  headers?: {
                    'content-type'?: string;
                    'content-length'?: string;
                  };
                },
              ),
      );
    }).catch(() => {
      throw new NotFoundException('文件不存在');
    });
    return {
      stream:
        data.Body instanceof Readable ? data.Body : Readable.from(data.Body),
      contentType: data.headers?.['content-type'] || 'application/octet-stream',
      contentLength: data.headers?.['content-length'],
    };
  }
}
