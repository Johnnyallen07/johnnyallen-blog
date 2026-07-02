import { Module } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesController } from './series.controller';
import { PrismaService } from '../prisma/prisma.service';
import { I18nModule } from '../i18n/i18n.module';

@Module({
  imports: [I18nModule],
  controllers: [SeriesController],
  providers: [SeriesService, PrismaService],
})
export class SeriesModule {}
