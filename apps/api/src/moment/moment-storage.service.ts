import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import { Readable } from 'stream';
import { createHash, randomUUID } from 'crypto';

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

  async createUploadUrl(objectKey: string, mimeType: string, checksum: string) {
    return new Promise<string>((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket(),
          Region: this.region(),
          Key: objectKey,
          Method: 'PUT',
          Sign: true,
          Expires: 900,
          Headers: {
            'Content-Type': mimeType,
            'x-cos-meta-sha256': checksum.toLowerCase(),
          },
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

  async createMultipartUpload(
    objectKey: string,
    mimeType: string,
    checksum: string,
  ) {
    const result = await this.cos.multipartInit({
      Bucket: this.bucket(),
      Region: this.region(),
      Key: objectKey,
      ContentType: mimeType,
      'x-cos-meta-sha256': checksum.toLowerCase(),
    });
    return result.UploadId;
  }

  createMultipartPartUrl(
    objectKey: string,
    uploadId: string,
    partNumber: number,
  ) {
    return this.cos.getObjectUrl({
      Bucket: this.bucket(),
      Region: this.region(),
      Key: objectKey,
      Method: 'PUT',
      Sign: true,
      Expires: 900,
      Query: {
        uploadId,
        partNumber: String(partNumber),
      },
    });
  }

  async multipartParts(objectKey: string, uploadId: string) {
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let marker: string | undefined;
    do {
      const result = await this.cos.multipartListPart({
        Bucket: this.bucket(),
        Region: this.region(),
        Key: objectKey,
        UploadId: uploadId,
        MaxParts: 1000,
        ...(marker ? { PartNumberMarker: marker } : {}),
      });
      parts.push(
        ...(result.Part || []).map((part) => ({
          partNumber: Number(part.PartNumber),
          etag: part.ETag,
          size: Number(part.Size),
        })),
      );
      marker =
        result.IsTruncated === 'true'
          ? String(result.NextPartNumberMarker)
          : undefined;
    } while (marker);
    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  async completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    await this.cos.multipartComplete({
      Bucket: this.bucket(),
      Region: this.region(),
      Key: objectKey,
      UploadId: uploadId,
      Parts: parts.map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
      })),
    });
  }

  async abortMultipartUpload(objectKey: string, uploadId: string) {
    await this.cos.multipartAbort({
      Bucket: this.bucket(),
      Region: this.region(),
      Key: objectKey,
      UploadId: uploadId,
    });
  }

  async createDownloadUrl(
    objectKey: string,
    fileName: string,
    download = false,
  ) {
    if (!objectKey.startsWith('moment/vault/'))
      throw new NotFoundException('文件不存在');
    return new Promise<string>((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket(),
          Region: this.region(),
          Key: objectKey,
          Method: 'GET',
          Sign: true,
          Expires: 300,
          Query: {
            'response-content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          },
        },
        (error, data) =>
          error || !data?.Url
            ? reject(
                error instanceof Error
                  ? error
                  : new Error(error?.message || '签名失败'),
              )
            : resolve(data.Url),
      );
    });
  }

  async createImagePreviewUrl(objectKey: string, maxEdge: 600 | 2048) {
    if (!objectKey.startsWith('moment/vault/'))
      throw new NotFoundException('文件不存在');
    return new Promise<string>((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket(),
          Region: this.region(),
          Key: objectKey,
          Method: 'GET',
          Sign: true,
          Expires: 300,
          Query: {
            [`imageMogr2/thumbnail/${maxEdge}x${maxEdge}>/format/webp`]: '',
          },
        },
        (error, data) =>
          error || !data?.Url
            ? reject(
                error instanceof Error
                  ? error
                  : new Error(error?.message || '图片预览签名失败'),
              )
            : resolve(data.Url),
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

  async objectExists(objectKey: string) {
    if (!objectKey.startsWith('moment/vault/')) return false;
    try {
      await this.cos.headObject({
        Bucket: this.bucket(),
        Region: this.region(),
        Key: objectKey,
      });
      return true;
    } catch {
      return false;
    }
  }

  async verifyObject(
    objectKey: string,
    expectedSize: bigint,
    expectedChecksum: string,
  ) {
    await this.assertObject(objectKey, expectedSize);
    const object = await this.getObject(objectKey);
    const digest = createHash('sha256');
    let size = 0n;
    for await (const chunk of object.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += BigInt(buffer.length);
      digest.update(buffer);
    }
    if (
      size !== expectedSize ||
      digest.digest('hex') !== expectedChecksum.toLowerCase()
    ) {
      throw new NotFoundException('文件完整性校验失败，已拒绝写入资料库');
    }
  }

  async deleteObject(objectKey: string) {
    if (!objectKey.startsWith('moment/vault/'))
      throw new NotFoundException('文件不存在');
    await new Promise<void>((resolve, reject) => {
      this.cos.deleteObject(
        { Bucket: this.bucket(), Region: this.region(), Key: objectKey },
        (error) =>
          error
            ? reject(
                error instanceof Error
                  ? error
                  : new Error(error.message || 'COS deleteObject failed'),
              )
            : resolve(),
      );
    });
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
