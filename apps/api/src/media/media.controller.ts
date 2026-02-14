import { Controller, Post, Body, Get, Param, Res } from '@nestjs/common';
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

  @Get(':key')
  async getMedia(@Param('key') key: string, @Res() res: Response) {
    const { stream, contentType } = await this.mediaService.getMedia(key);
    res.set('Content-Type', contentType || 'application/octet-stream');
    stream.pipe(res);
  }
}
