import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Headers,
  Param,
  Query,
  Res,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { SaveYoutubeDto } from './dto/save-youtube.dto';
import { MusicService } from './music.service';
import { AuthService } from '../auth/auth.service';
import { CreateMusicTrackDto } from './dto/create-music-track.dto';
import { UpdateMusicTrackDto } from './dto/update-music-track.dto';
import { YoutubeDownloadDto } from './dto/youtube-download.dto';
import { SplitMusicDto } from './dto/split-music.dto';
import { SuggestYoutubeMetadataDto } from './dto/suggest-youtube-metadata.dto';

@Controller('music')
export class MusicController {
  constructor(
    private readonly musicService: MusicService,
    private readonly authService: AuthService,
  ) {}

  private async requireAdmin(authHeader: string | undefined) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证 Token');
    }
    await this.authService.getProfile(authHeader.slice(7));
  }

  /** 从 YouTube 下载音频为 MP3 — 启动任务 */
  @Post('youtube-download')
  async youtubeDownload(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: YoutubeDownloadDto,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.startYoutubeDownload(dto.url);
  }

  /** 更新生产环境 YouTube cookies.txt */
  @Post('youtube-cookies')
  async updateYoutubeCookies(
    @Headers('authorization') authHeader: string | undefined,
    @Body('cookies') cookies: string,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.updateYoutubeCookies(cookies);
  }

  /** 查看 Cookie 是否已配置、更新时间与粗略有效性（不返回敏感内容） */
  @Get('youtube-cookies')
  async getYoutubeCookiesStatus(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.getYoutubeCookiesStatus();
  }

  @Get('youtube-metadata/status')
  async youtubeMetadataStatus(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.getYoutubeMetadataStatus();
  }

  /** 检索现有音乐库并由 AI 生成逐条待审核元数据 */
  @Post('youtube-metadata/suggest')
  async suggestYoutubeMetadata(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SuggestYoutubeMetadataDto,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.suggestYoutubeMetadata(dto.taskIds, dto.force);
  }

  /** 轮询下载进度 */
  @Get('youtube-download/:taskId')
  async youtubeDownloadProgress(
    @Headers('authorization') authHeader: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    await this.requireAdmin(authHeader);
    const progress =
      this.musicService.getDownloadProgress(taskId) ||
      (await this.musicService.getSavedYoutubeTask(taskId));
    if (!progress) {
      throw new NotFoundException('Task not found');
    }
    return progress;
  }

  /** 清理已完成的任务 */
  @Delete('youtube-download/:taskId')
  async youtubeDownloadCleanup(
    @Headers('authorization') authHeader: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    await this.requireAdmin(authHeader);
    this.musicService.cleanupTask(taskId);
    return { ok: true };
  }

  /** 上传已下载的临时文件到 COS */
  @Post('youtube-upload/:taskId')
  async youtubeUpload(
    @Headers('authorization') authHeader: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.uploadTaskToCos(taskId);
  }

  /** 上传到 COS + 保存到数据库 (一步到位) */
  @Post('youtube-upload/:taskId/save')
  async youtubeUploadAndSave(
    @Param('taskId') taskId: string,
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: SaveYoutubeDto,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.uploadAndSaveTask(taskId, body);
  }

  @Get('youtube-runtime')
  async youtubeRuntime(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.getYoutubeRuntimeStatus();
  }

  @Post('youtube-runtime/update')
  async updateYoutubeRuntime(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.updateYoutubeRuntime();
  }

  @Get('youtube-preview/:taskId')
  async youtubePreview(
    @Headers('authorization') authHeader: string | undefined,
    @Param('taskId') taskId: string,
    @Res() response: Response,
  ) {
    await this.requireAdmin(authHeader);
    response.setHeader('Cache-Control', 'private, no-store');
    response.sendFile(this.musicService.getYoutubePreviewPath(taskId));
  }

  /** 分割音乐文件 */
  @Post('split')
  async splitTrack(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SplitMusicDto,
  ) {
    await this.requireAdmin(authHeader);
    return this.musicService.splitTrack(dto.trackId, dto.segments);
  }

  /** 生成预签名上传 URL */
  @Post('upload-url')
  async getUploadUrl(@Body('fileName') fileName: string) {
    return this.musicService.generateUploadUrl(fileName);
  }

  /** 批量创建曲目 */
  @Post('batch')
  async createBatch(@Body() dtos: CreateMusicTrackDto[]) {
    return this.musicService.createBatch(dtos);
  }

  /** 获取所有不重复的分类 */
  @Get('categories')
  async getCategories() {
    return this.musicService.getCategories();
  }

  /** 获取所有不重复的作曲家 */
  @Get('musicians')
  async getMusicians() {
    return this.musicService.getMusicians();
  }

  /** 获取曲目（分页 + 筛选）；category/artist/series 筛选值始终用中文规范值 */
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('artist') artist?: string,
    @Query('series') series?: string,
    @Query('locale') locale?: string,
  ) {
    return this.musicService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search,
      category,
      artist,
      series,
      locale,
    });
  }

  /** 检查曲目标题是否已存在 */
  @Get('check-title')
  async checkTitle(@Query('title') title: string) {
    return this.musicService.checkTitleExists(title);
  }

  /** 获取各维度的歌曲数量 */
  @Get('counts')
  async getCounts() {
    return this.musicService.getCounts();
  }

  /** 播放计数 +1 */
  @Patch(':id/play')
  async incrementPlayCount(@Param('id') id: string) {
    return this.musicService.incrementPlayCount(id);
  }

  /** 获取单个曲目 */
  @Get(':id')
  async findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.musicService.findOne(id, locale);
  }

  /** 创建单条曲目 */
  @Post()
  async create(@Body() dto: CreateMusicTrackDto) {
    return this.musicService.create(dto);
  }

  /** 更新曲目 */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMusicTrackDto) {
    return this.musicService.update(id, dto);
  }

  /** 批量更新排序 */
  @Patch('reorder/batch')
  async reorder(@Body('ids') ids: string[]) {
    return this.musicService.reorder(ids);
  }

  /** 删除曲目 */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.musicService.remove(id);
  }
}
