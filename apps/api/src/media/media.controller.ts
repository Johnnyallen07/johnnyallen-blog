import {
  Controller,
  Post,
  Body,
  Get,
  Head,
  Param,
  Res,
  Query,
  Headers,
} from '@nestjs/common';
import { MediaService } from './media.service';
import type { Response } from 'express';
import type { Readable } from 'stream';
import { parseByteRange, type ByteRange } from './media-range';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  private setSharedMediaHeaders(
    res: Response,
    metadata: {
      contentType: string;
      contentLength: number;
      etag?: string;
      lastModified?: string;
    },
  ) {
    res.set('Content-Type', metadata.contentType);
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.set(
      'Access-Control-Expose-Headers',
      'Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified',
    );
    if (metadata.etag) res.set('ETag', metadata.etag);
    if (metadata.lastModified) res.set('Last-Modified', metadata.lastModified);
  }

  private pipeMedia(stream: Readable, res: Response) {
    stream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
    stream.pipe(res);
  }

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
    const { stream, contentType, contentLength } =
      await this.mediaService.getMedia(cleanKey);
    const fileName = encodeURIComponent(
      filename || cleanKey.split('/').pop() || 'download',
    );
    res.set('Content-Type', contentType || 'application/octet-stream');
    res.set('Content-Length', String(contentLength));
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
    res.set('Cache-Control', 'private, max-age=0, no-cache');
    res.set('Access-Control-Allow-Origin', '*');
    this.pipeMedia(stream, res);
  }

  @Head('*key')
  async headMedia(@Param('key') key: string | string[], @Res() res: Response) {
    // Express 5 wildcard captures path segments as an array
    const cleanKey = (Array.isArray(key) ? key.join('/') : key).replace(
      /^\/+/,
      '',
    );
    const metadata = await this.mediaService.getMediaMetadata(cleanKey);
    this.setSharedMediaHeaders(res, metadata);
    res.set('Content-Length', String(metadata.contentLength));
    res.end();
  }

  @Get('*key')
  async getMedia(
    @Param('key') key: string | string[],
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ) {
    // Express 5 wildcard captures path segments as an array
    const cleanKey = (Array.isArray(key) ? key.join('/') : key).replace(
      /^\/+/,
      '',
    );
    const metadata = await this.mediaService.getMediaMetadata(cleanKey);
    this.setSharedMediaHeaders(res, metadata);

    let byteRange: ByteRange | null;
    try {
      byteRange = parseByteRange(rangeHeader, metadata.contentLength);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      res.status(416);
      res.set('Content-Range', `bytes */${metadata.contentLength}`);
      res.end();
      return;
    }

    if (byteRange) {
      const length = byteRange.end - byteRange.start + 1;
      res.status(206);
      res.set(
        'Content-Range',
        `bytes ${byteRange.start}-${byteRange.end}/${metadata.contentLength}`,
      );
      res.set('Content-Length', String(length));
      const stream = this.mediaService.getMediaStream(
        cleanKey,
        `bytes=${byteRange.start}-${byteRange.end}`,
      );
      this.pipeMedia(stream, res);
      return;
    }

    res.status(200);
    res.set('Content-Length', String(metadata.contentLength));
    this.pipeMedia(this.mediaService.getMediaStream(cleanKey), res);
  }
}
