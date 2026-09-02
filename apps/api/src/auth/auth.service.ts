import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TTL = '2h';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function deviceIdentity(userAgent = '') {
  const value = userAgent.toLowerCase();
  const browser = value.includes('edg/')
    ? 'Edge'
    : value.includes('firefox/')
      ? 'Firefox'
      : value.includes('chrome/') || value.includes('crios/')
        ? 'Chrome'
        : value.includes('safari/')
          ? 'Safari'
          : 'Browser';
  const platform = value.includes('iphone')
    ? 'iPhone'
    : value.includes('ipad')
      ? 'iPad'
      : value.includes('android')
        ? 'Android'
        : value.includes('macintosh')
          ? 'Mac'
          : value.includes('windows')
            ? 'Windows'
            : value.includes('linux')
              ? 'Linux'
              : 'Device';
  const normalized = `${browser.toLowerCase()}:${platform.toLowerCase()}`;
  return {
    label: `${platform} · ${browser}`,
    signature: hash(`admin-device-v1:${normalized}`),
  };
}

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

  async login(
    username: string,
    password: string,
    rememberDevice = true,
    trustedDays = 7,
    userAgent?: string,
    ip?: string,
  ) {
    const user = await this.validateUser(username, password);
    const token = await this.createAccessToken(user.id, user.username);
    if (!rememberDevice) return { token };
    const days = Math.max(1, Math.min(30, trustedDays));
    const trustedToken = `adm_trusted_${randomBytes(32).toString('base64url')}`;
    const device = deviceIdentity(userAgent);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60_000);
    await this.prisma.adminTrustedDevice.create({
      data: {
        userId: user.id,
        tokenHash: hash(trustedToken),
        deviceLabel: device.label,
        deviceSignature: device.signature,
        lastIp: ip,
        expiresAt,
      },
    });
    return {
      token,
      trustedToken,
      trustedExpiresAt: expiresAt,
    };
  }

  private createAccessToken(userId: string, username: string) {
    return this.jwtService.signAsync(
      { sub: userId, username, scope: 'admin' },
      { expiresIn: ACCESS_TTL } as never,
    );
  }

  async refreshTrustedDevice(
    rawToken: string,
    userAgent?: string,
    ip?: string,
  ) {
    const record = await this.prisma.adminTrustedDevice.findUnique({
      where: { tokenHash: hash(rawToken) },
      include: { user: true },
    });
    const device = deviceIdentity(userAgent);
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      record.deviceSignature !== device.signature
    ) {
      throw new UnauthorizedException('可信设备凭证无效或已过期');
    }
    await this.prisma.adminTrustedDevice.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date(), lastIp: ip },
    });
    return {
      token: await this.createAccessToken(record.userId, record.user.username),
      expiresAt: record.expiresAt,
    };
  }

  trustedDevices(userId: string) {
    return this.prisma.adminTrustedDevice.findMany({
      where: { userId },
      select: {
        id: true,
        deviceLabel: true,
        lastIp: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeTrustedDevice(userId: string, id: string) {
    const result = await this.prisma.adminTrustedDevice.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
  }

  async revokeTrustedToken(rawToken: string) {
    const result = await this.prisma.adminTrustedDevice.updateMany({
      where: { tokenHash: hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
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
