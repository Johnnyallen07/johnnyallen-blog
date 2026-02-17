import { Controller, Post, Body, Get, Head, Param, Res } from '@nestjs/common';
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
    @Body('type') type: 'IMAGE' | 'VIDEO',
  ) {
    return this.mediaService.saveMediaReference(key, url, type);
  }

  @Head(':key')
  async headMedia(@Param('key') key: string, @Res() res: Response) {
    const { contentType } = await this.mediaService.getMedia(key);
    res.set('Content-Type', contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end();
  }

  @Get(':key')
  async getMedia(@Param('key') key: string, @Res() res: Response) {
    const { stream, contentType } = await this.mediaService.getMedia(key);
    res.set('Content-Type', contentType || 'application/octet-stream');
    // 浏览器缓存 30 天，图片内容不可变（key 是 UUID）
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  }
}
