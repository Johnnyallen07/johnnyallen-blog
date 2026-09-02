import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { MomentAuthService } from './moment-auth.service';
import { MomentController } from './moment.controller';
import {
  MomentAccessGuard,
  MomentAdminGuard,
  MomentLoginGatewayGuard,
  MomentSyncGuard,
} from './moment.guards';
import { MomentService } from './moment.service';
import { MomentStorageService } from './moment-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [MomentController],
  providers: [
    PrismaService,
    MomentAuthService,
    MomentService,
    MomentStorageService,
    MomentAccessGuard,
    MomentAdminGuard,
    MomentLoginGatewayGuard,
    MomentSyncGuard,
  ],
})
export class MomentModule {}
