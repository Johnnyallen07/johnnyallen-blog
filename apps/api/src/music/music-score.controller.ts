import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { MusicScoreService } from './music-score.service';
import { CreateMusicScoreDto } from './dto/create-music-score.dto';
import { UpdateMusicScoreDto } from './dto/update-music-score.dto';
import { CreateScoreUploadUrlsDto } from './dto/create-score-upload-urls.dto';

@Controller('music-scores')
export class MusicScoreController {
  constructor(private readonly musicScoreService: MusicScoreService) {}

  /** 生成预签名上传 URL（PDF 或图片） */
  @Post('upload-url')
  async getUploadUrl(
    @Body('fileName') fileName: string,
    @Body('contentType') contentType?: string,
  ) {
    return this.musicScoreService.generateUploadUrl(fileName, contentType);
  }

  /** 批量生成预签名上传 URL（图片乐谱多页） */
  @Post('upload-urls')
  async getUploadUrls(@Body() dto: CreateScoreUploadUrlsDto) {
    return this.musicScoreService.generateUploadUrls(dto.files);
  }

  /** 获取乐谱列表（可按乐器筛选） */
  @Get()
  async findAll(
    @Query('instrument') instrument?: string,
    @Query('locale') locale?: string,
  ) {
    return this.musicScoreService.findAll(instrument, locale);
  }

  /** 获取单个乐谱 */
  @Get(':id')
  async findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.musicScoreService.findOne(id, locale);
  }

  /** 创建乐谱 */
  @Post()
  async create(@Body() dto: CreateMusicScoreDto) {
    return this.musicScoreService.create(dto);
  }

  /** 更新乐谱 */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMusicScoreDto) {
    return this.musicScoreService.update(id, dto);
  }

  /** 删除乐谱 */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.musicScoreService.remove(id);
  }
}
