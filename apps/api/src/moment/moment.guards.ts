import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MomentAuthService } from './moment-auth.service';
import { sha256 } from './moment-crypto';
import { AuthService } from '../auth/auth.service';

export type MomentRequest = Request & {
  momentAccess?: 'public' | 'admin';
  momentActor?: string;
};

function bearer(req: Request): string | undefined {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}

@Injectable()
export class MomentLoginGatewayGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const publicToken = req.headers['x-moment-public-token'];
    const configured = this.config.get<string>('MOMENT_PUBLIC_API_TOKEN');
    if (
      configured &&
      typeof publicToken === 'string' &&
      sha256(publicToken) === sha256(configured)
    )
      return true;
    const token = bearer(req);
    if (token) {
      await this.auth.getProfile(token);
      return true;
    }
    throw new UnauthorizedException('缺少 Moment 登录网关凭证');
  }
}

@Injectable()
export class MomentAccessGuard implements CanActivate {
  constructor(
    private readonly auth: MomentAuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MomentRequest>();
    const token = bearer(req);
    if (token) {
      const payload = await this.auth.verifyAdminToken(token);
      req.momentAccess = 'admin';
      req.momentActor = `user:${payload.sub}`;
      return true;
    }
    const publicToken = req.headers['x-moment-public-token'];
    const configured = this.config.get<string>('MOMENT_PUBLIC_API_TOKEN');
    if (
      configured &&
      typeof publicToken === 'string' &&
      sha256(publicToken) === sha256(configured)
    ) {
      req.momentAccess = 'public';
      req.momentActor = 'public-gateway';
      return true;
    }
    throw new UnauthorizedException('缺少 Moment 访问凭证');
  }
}

@Injectable()
export class MomentAdminGuard implements CanActivate {
  constructor(private readonly auth: MomentAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MomentRequest>();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('缺少 Moment 管理凭证');
    const payload = await this.auth.verifyAdminToken(token);
    req.momentAccess = 'admin';
    req.momentActor = `user:${payload.sub}`;
    return true;
  }
}

@Injectable()
export class MomentSyncGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MomentRequest>();
    const raw = req.headers['x-moment-sync-token'];
    if (typeof raw !== 'string') {
      throw new UnauthorizedException('缺少同步 Token');
    }
    const token = await this.prisma.momentSyncToken.findUnique({
      where: { tokenHash: sha256(raw) },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= new Date())
    ) {
      throw new UnauthorizedException('同步 Token 无效或已撤销');
    }
    await this.prisma.momentSyncToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    req.momentAccess = 'admin';
    req.momentActor = `sync:${token.id}`;
    return true;
  }
}
