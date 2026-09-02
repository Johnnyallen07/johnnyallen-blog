import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const payload = { sub: user.id, username: user.username };
    return {
      token: await this.jwtService.signAsync(payload),
    };
  }

  async getProfile(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        username: string;
      }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, name: true },
      });
      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }
      return user;
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }

  async signScopedToken(
    payload: Record<string, unknown>,
    expiresIn: string | number,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, { expiresIn } as never);
  }

  async verifyScopedToken<T extends Record<string, unknown>>(
    token: string,
  ): Promise<T> {
    try {
      return await this.jwtService.verifyAsync<T>(token);
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }
}
