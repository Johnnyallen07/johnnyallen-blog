import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { I18nModule } from '../i18n/i18n.module';

@Module({
  imports: [I18nModule],
  controllers: [PostsController],
  providers: [PostsService, PrismaService, MediaService],
  exports: [PostsService],
})
export class PostsModule {}
