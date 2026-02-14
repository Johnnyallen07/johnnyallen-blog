import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { Readable } from 'stream';

@Injectable()
export class MediaService {
  private s3Client: S3Client;

  constructor(private prisma: PrismaService) {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true, // Specific for R2 to work correctly with some clients, though usually fine.
    });
  }

  async generatePresignedUrl(fileName: string, contentType: string) {
    const fileId = uuidv4();
    const extension = fileName.split('.').pop();
    const key = `${fileId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    try {
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600,
      });

      console.log(
        'Generating presigned URL with domain:',
        process.env.R2_PUBLIC_DOMAIN,
      );
      console.log(
        'Generated publicUrl:',
        `${process.env.R2_PUBLIC_DOMAIN}/${key}`,
      );

      return {
        uploadUrl,
        key,
        publicUrl: `${process.env.R2_PUBLIC_DOMAIN}/${key}`,
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
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      return {
        stream: response.Body as Readable,
        contentType: response.ContentType,
      };
    } catch (error) {
      console.error('Error getting object from R2:', error);
      throw new NotFoundException('File not found');
    }
  }
}
