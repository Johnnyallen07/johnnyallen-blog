import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { MusicCategoryController } from './music-category.controller';
import { MusicCategoryService } from './music-category.service';
import { MusicArtistController } from './music-artist.controller';
import { MusicArtistService } from './music-artist.service';
import { MusicSeriesController } from './music-series.controller';
import { MusicSeriesService } from './music-series.service';

@Module({
  controllers: [
    MusicController,
    MusicCategoryController,
    MusicArtistController,
    MusicSeriesController,
  ],
  providers: [
    MusicService,
    MusicCategoryService,
    MusicArtistService,
    MusicSeriesService,
    PrismaService,
  ],
})
export class MusicModule {}
