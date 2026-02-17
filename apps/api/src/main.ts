import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 开发环境下返回真实错误信息，便于排查 DB 与 Prisma schema 不一致等
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS：生产站与本地开发，避免预检无 Access-Control-Allow-Origin
  app.enableCors({
    origin: [
      'https://johnnyallen.blog',
      'http://localhost:3000',
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
