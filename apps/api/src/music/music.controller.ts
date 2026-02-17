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
import { MusicService } from './music.service';
import { CreateMusicTrackDto } from './dto/create-music-track.dto';
import { UpdateMusicTrackDto } from './dto/update-music-track.dto';

@Controller('music')
export class MusicController {
    constructor(private readonly musicService: MusicService) { }

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

    /** 获取所有曲目 */
    @Get()
    async findAll(
        @Query('search') search?: string,
        @Query('category') category?: string,
    ) {
        return this.musicService.findAll(search, category);
    }

    /** 播放计数 +1 */
    @Patch(':id/play')
    async incrementPlayCount(@Param('id') id: string) {
        return this.musicService.incrementPlayCount(id);
    }

    /** 获取单个曲目 */
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.musicService.findOne(id);
    }

    /** 创建单条曲目 */
    @Post()
    async create(@Body() dto: CreateMusicTrackDto) {
        return this.musicService.create(dto);
    }

    /** 更新曲目 */
    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateMusicTrackDto,
    ) {
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
