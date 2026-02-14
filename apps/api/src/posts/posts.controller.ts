import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
    @Query('categoryId') categoryId?: string,
    @Query('featured', new ParseBoolPipe({ optional: true }))
    featured?: boolean,
    @Query('standalone', new ParseBoolPipe({ optional: true }))
    standalone?: boolean,
  ) {
    return this.postsService.findAll({
      skip,
      take,
      categoryId,
      featured,
      standalone,
    });
  }

  @Get('latest')
  findLatest(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.postsService.findLatest(limit);
  }

  @Get('featured')
  findFeatured() {
    return this.postsService.findFeatured();
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.postsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  @Post(':id/view')
  incrementViews(@Param('id') id: string) {
    return this.postsService.incrementViews(id);
  }

  @Post(':id/like')
  toggleLike(
    @Param('id') id: string,
    @Body('action') action: 'like' | 'unlike',
  ) {
    return this.postsService.toggleLike(id, action || 'like');
  }

  @Post()
  create(@Body() createPostDto: CreatePostDto) {
    return this.postsService.create(createPostDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto) {
    return this.postsService.update(id, updatePostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.postsService.remove(id);
  }
}
