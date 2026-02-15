import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { UpdateSeriesStructureDto } from './dto/update-series-structure.dto';
import { AddSeriesItemDto } from './dto/add-series-item.dto';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post()
  create(@Body() createSeriesDto: CreateSeriesDto) {
    return this.seriesService.create(createSeriesDto);
  }

  @Get()
  findAll() {
    return this.seriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSeriesDto: UpdateSeriesDto) {
    return this.seriesService.update(id, updateSeriesDto);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: AddSeriesItemDto) {
    return this.seriesService.addItem(id, dto);
  }

  @Patch(':id/structure')
  updateStructure(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesStructureDto,
  ) {
    return this.seriesService.updateStructure(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.seriesService.remove(id);
  }

  @Delete('items/:itemId')
  removeSeriesItem(@Param('itemId') itemId: string) {
    return this.seriesService.removeSeriesItem(itemId);
  }

  @Patch('items/:itemId')
  updateSeriesItem(
    @Param('itemId') itemId: string,
    @Body()
    dto: { title?: string; published?: boolean; parentId?: string | null },
  ) {
    return this.seriesService.updateSeriesItem(itemId, dto);
  }
}
