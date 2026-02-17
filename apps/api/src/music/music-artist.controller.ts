import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { MusicArtistService } from './music-artist.service';
import { CreateSidebarEntityDto } from './dto/create-sidebar-entity.dto';
import { UpdateSidebarEntityDto } from './dto/update-sidebar-entity.dto';

@Controller('music-artists')
export class MusicArtistController {
  constructor(private readonly service: MusicArtistService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateSidebarEntityDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  reorder(@Body('ids') ids: string[]) {
    return this.service.reorder(ids);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSidebarEntityDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
