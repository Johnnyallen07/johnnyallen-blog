import * as path from 'path';
import * as fs from 'fs';

// Preload root .env BEFORE any module imports that need env vars (e.g. Prisma)
// Only needed in local dev — in production (Docker), env vars come from docker-compose
if (process.env.NODE_ENV !== 'production') {
  function findRootEnv(): string | undefined {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      const envPath = path.join(dir, '.env');
      if (fs.existsSync(envPath)) return envPath;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }

  const rootEnv = findRootEnv();
  if (rootEnv) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require('dotenv');
    config({ path: rootEnv });
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 提高 JSON body 限制，支持 base64 文件上传（参考题目图片/PDF）
  app.useBodyParser('json', { limit: '50mb' });

  // 开发环境下返回真实错误信息，便于排查 DB 与 Prisma schema 不一致等
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS：生产站与本地开发，避免预检无 Access-Control-Allow-Origin
  app.enableCors({
    origin: [
      'https://johnnyallen.blog',
      /^https:\/\/[\w-]+\.johnnyallen\.blog$/,
      /^http:\/\/localhost(:\d+)?$/,
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
