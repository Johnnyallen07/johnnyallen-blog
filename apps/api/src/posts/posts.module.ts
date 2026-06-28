import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, PrismaService, MediaService],
  exports: [PostsService],
})
export class PostsModule {}
