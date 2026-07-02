import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './categories/categories.module';
import { PostsModule } from './posts/posts.module';

import { MediaModule } from './media/media.module';
import { SeriesModule } from './series/series.module';
import { MusicModule } from './music/music.module';
import { AuthModule } from './auth/auth.module';
import { I18nModule } from './i18n/i18n.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(__dirname, '../../../../.env'), // dist/src/ → root (prod)
        path.resolve(__dirname, '../../../.env'), // src/ → root (dev)
        path.resolve(__dirname, '../.env'), // apps/api/.env fallback
      ],
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 60 * 1000, // 默认 60s TTL (ms)
      max: 200, // 内存最多缓存 200 条
    }),
    AuthModule,
    CategoriesModule,
    PostsModule,
    MediaModule,
    SeriesModule,
    MusicModule,
    I18nModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
