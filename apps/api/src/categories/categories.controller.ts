import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('tree')
  getTree(@Query('locale') locale?: string) {
    return this.categoriesService.getTree(locale);
  }

  @Get()
  findAll(@Query('locale') locale?: string) {
    return this.categoriesService.findAll(locale);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.categoriesService.findBySlug(slug, locale);
  }

  @Get(':slug/content')
  findContent(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.categoriesService.findContent(slug, locale);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
