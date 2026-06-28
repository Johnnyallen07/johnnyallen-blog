import {
  Controller,
  Post,
  Body,
  Get,
  Head,
  Param,
  Res,
  Query,
} from '@nestjs/common';
import { MediaService } from './media.service';
import type { Response } from 'express';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  async getUploadUrl(
    @Body('fileName') fileName: string,
    @Body('contentType') contentType: string,
  ) {
    return this.mediaService.generatePresignedUrl(fileName, contentType);
  }

  @Post('confirm')
  async confirmUpload(
    @Body('key') key: string,
    @Body('url') url: string,
    @Body('type') type: 'IMAGE' | 'VIDEO' | 'FILE',
  ) {
    return this.mediaService.saveMediaReference(key, url, type);
  }

  @Get('download/*key')
  async downloadMedia(
    @Param('key') key: string | string[],
    @Query('filename') filename: string | undefined,
    @Res() res: Response,
  ) {
    const cleanKey = (Array.isArray(key) ? key.join('/') : key).replace(
      /^\/+/,
      '',
    );
    const { stream, contentType } = await this.mediaService.getMedia(cleanKey);
    const fileName = encodeURIComponent(
      filename || cleanKey.split('/').pop() || 'download',
    );
    res.set('Content-Type', contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
    res.set('Cache-Control', 'private, max-age=0, no-cache');
    res.set('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  }

  @Head('*key')
  async headMedia(@Param('key') key: string | string[], @Res() res: Response) {
    // Express 5 wildcard captures path segments as an array
    const cleanKey = (Array.isArray(key) ? key.join('/') : key).replace(
      /^\/+/,
      '',
    );
    const { contentType } = await this.mediaService.getMedia(cleanKey);
    res.set('Content-Type', contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end();
  }

  @Get('*key')
  async getMedia(@Param('key') key: string | string[], @Res() res: Response) {
    // Express 5 wildcard captures path segments as an array
    const cleanKey = (Array.isArray(key) ? key.join('/') : key).replace(
      /^\/+/,
      '',
    );
    const { stream, contentType } = await this.mediaService.getMedia(cleanKey);
    res.set('Content-Type', contentType || 'application/octet-stream');
    // 浏览器缓存 30 天，图片内容不可变（key 是 UUID）
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  }
}
