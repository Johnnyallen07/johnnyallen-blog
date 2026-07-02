import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

/**
 * 通用 JWT 守卫：校验 Authorization: Bearer <token> 并把用户挂到 req.user。
 * 使用方模块需 import AuthModule（其已 export AuthService）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证 Token');
    }
    req.user = await this.authService.getProfile(auth.slice(7));
    return true;
  }
}
