import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { I18nController } from './i18n.controller';
import { I18nService } from './i18n.service';
import { TranslationService } from './translation/translation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [I18nController],
  providers: [I18nService, TranslationService, PrismaService, JwtAuthGuard],
  exports: [I18nService],
})
export class I18nModule {}
