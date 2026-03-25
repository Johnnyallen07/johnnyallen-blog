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
import { MusicScoreController } from './music-score.controller';
import { MusicScoreService } from './music-score.service';

@Module({
  controllers: [
    MusicController,
    MusicCategoryController,
    MusicArtistController,
    MusicSeriesController,
    MusicScoreController,
  ],
  providers: [
    MusicService,
    MusicCategoryService,
    MusicArtistService,
    MusicSeriesService,
    MusicScoreService,
    PrismaService,
  ],
})
export class MusicModule {}
