import { Module } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesController } from './series.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SeriesController],
  providers: [SeriesService, PrismaService],
})
export class SeriesModule {}
