import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  matchedTotpStep,
  randomBase32,
  randomToken,
  sha256,
  verifySha256,
  verifyTotp,
} from './moment-crypto';

type AdminUser = { id: string; username: string };
const TRUSTED_DEVICE_TTL_MS = 7 * 24 * 60 * 60_000;

function deviceIdentity(userAgent = '') {
  const value = userAgent.toLowerCase();
  const browser = value.includes('edg/')
    ? 'Edge'
    : value.includes('firefox/')
      ? 'Firefox'
      : value.includes('crios/') || value.includes('chrome/')
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
    signature: sha256(`moment-device-v1:${normalized}`),
  };
}

@Injectable()
export class MomentAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('MOMENT_ENCRYPTION_KEY');
    if (key) return key;
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new InternalServerErrorException(
        'MOMENT_ENCRYPTION_KEY is required in production',
      );
    }
    return this.config.get<string>('JWT_SECRET', 'moment-local-development');
  }

  private async credential(userId: string) {
    return this.prisma.momentCredential.findUnique({ where: { userId } });
  }

  async status(userId: string) {
    const credential = await this.credential(userId);
    return {
      enabled: credential?.totpEnabled ?? false,
      recoveryCodesRemaining: credential?.recoveryCodeHashes.length ?? 0,
      lastUsedAt: credential?.lastUsedAt ?? null,
    };
  }

  async startSetup(user: AdminUser) {
    const current = await this.credential(user.id);
    if (current?.totpEnabled) {
      throw new BadRequestException('Moment 2FA 已启用');
    }
    const secret = randomBase32();
    await this.prisma.momentCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totpSecretEnc: encryptSecret(secret, this.encryptionKey()),
        recoveryCodeHashes: [],
      },
      update: {
        totpSecretEnc: encryptSecret(secret, this.encryptionKey()),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    const issuer = encodeURIComponent('Johnny Moment');
    const account = encodeURIComponent(user.username);
    return {
      secret,
      otpauthUri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmSetup(userId: string, code: string) {
    const credential = await this.credential(userId);
    if (!credential?.totpSecretEnc) {
      throw new BadRequestException('请先开始 2FA 配置');
    }
    const secret = decryptSecret(
      credential.totpSecretEnc,
      this.encryptionKey(),
    );
    if (!verifyTotp(secret, code)) {
      // A wrong setup code is a form-validation error, not an expired Admin
      // session. Returning 401 here made the Admin client clear auth_token.
      throw new BadRequestException('验证码不正确，请等待新验证码后重试');
    }
    const recoveryCodes = createRecoveryCodes();
    await this.prisma.momentCredential.update({
      where: { userId },
      data: {
        totpEnabled: true,
        recoveryCodeHashes: recoveryCodes.map((item) => sha256(item)),
        failedAttempts: 0,
        lockedUntil: null,
        lastUsedAt: new Date(),
      },
    });
    return { recoveryCodes };
  }

  async login(
    username: string,
    password: string,
    code: string,
    rememberDevice = true,
    userAgent?: string,
    ip?: string,
  ) {
    const loginActor = `login:${sha256(username.trim().toLowerCase()).slice(0, 20)}`;
    const recentPasswordFailures = await this.prisma.momentAuditLog.count({
      where: {
        actor: loginActor,
        action: 'AUTH_PASSWORD_FAILURE',
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
    });
    if (recentPasswordFailures >= 5) {
      throw new HttpException(
        '验证失败次数过多，请 15 分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let user: Awaited<ReturnType<AuthService['validateUser']>>;
    try {
      user = await this.auth.validateUser(username, password);
    } catch {
      await this.audit(loginActor, 'AUTH_PASSWORD_FAILURE', ip);
      throw new UnauthorizedException('用户名、密码或验证码错误');
    }
    const credential = await this.credential(user.id);
    if (!credential?.totpEnabled || !credential.totpSecretEnc) {
      throw new ForbiddenException('Moment 2FA 尚未配置，请先在 Admin 中启用');
    }
    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      throw new HttpException(
        '验证失败次数过多，请 15 分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const normalizedRecovery = code.trim().toUpperCase();
    const recoveryHash = sha256(normalizedRecovery);
    const recoveryIndex = credential.recoveryCodeHashes.indexOf(recoveryHash);
    const secret = decryptSecret(
      credential.totpSecretEnc,
      this.encryptionKey(),
    );
    const totpStep = matchedTotpStep(secret, code);
    const validTotp =
      totpStep !== null &&
      (credential.lastTotpStep === null ||
        BigInt(totpStep) > credential.lastTotpStep);

    if (!validTotp && recoveryIndex < 0) {
      const attempts = credential.failedAttempts + 1;
      await this.prisma.momentCredential.update({
        where: { userId: user.id },
        data: {
          failedAttempts: attempts,
          lockedUntil:
            attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
        },
      });
      await this.audit(`user:${user.id}`, 'AUTH_FAILURE', ip);
      throw new UnauthorizedException('用户名、密码或验证码错误');
    }

    const recoveryCodes = [...credential.recoveryCodeHashes];
    if (recoveryIndex >= 0) recoveryCodes.splice(recoveryIndex, 1);
    await this.prisma.momentCredential.update({
      where: { userId: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        recoveryCodeHashes: recoveryCodes,
        lastTotpStep:
          validTotp && totpStep !== null
            ? BigInt(totpStep)
            : credential.lastTotpStep,
        lastUsedAt: new Date(),
      },
    });
    await this.audit(
      `user:${user.id}`,
      recoveryIndex >= 0 ? 'AUTH_RECOVERY' : 'AUTH_SUCCESS',
      ip,
    );
    const trustedDevice = rememberDevice
      ? await this.createTrustedDevice(user.id, userAgent, ip)
      : null;
    return {
      token: await this.createAccessToken(
        user.id,
        user.username,
        trustedDevice?.id,
      ),
      expiresIn: 7200,
      trustedToken: trustedDevice?.token,
      trustedExpiresIn: trustedDevice
        ? TRUSTED_DEVICE_TTL_MS / 1000
        : undefined,
    };
  }

  async refreshTrustedDevice(
    rawToken: string,
    userAgent?: string,
    ip?: string,
  ) {
    const [id, secret, ...extra] = rawToken.split('.');
    if (!id || !secret || extra.length > 0) {
      throw new UnauthorizedException('可信设备凭证无效或已过期');
    }
    const device = await this.prisma.momentTrustedDevice.findUnique({
      where: { id },
      include: { user: { select: { username: true } } },
    });
    if (
      !device ||
      device.revokedAt ||
      device.expiresAt <= new Date() ||
      !verifySha256(secret, device.tokenHash)
    ) {
      if (
        device &&
        !device.revokedAt &&
        !verifySha256(secret, device.tokenHash)
      ) {
        await this.prisma.momentTrustedDevice.update({
          where: { id: device.id },
          data: { revokedAt: new Date() },
        });
        await this.audit(
          `user:${device.userId}`,
          'TRUSTED_TOKEN_REUSE_BLOCKED',
          ip,
        );
      }
      throw new UnauthorizedException('可信设备凭证无效或已过期');
    }

    const identity = deviceIdentity(userAgent);
    if (identity.signature !== device.deviceSignature) {
      await this.prisma.momentTrustedDevice.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
      await this.audit(`user:${device.userId}`, 'TRUSTED_DEVICE_MISMATCH', ip);
      throw new UnauthorizedException('设备环境已变化，请重新进行双重验证');
    }

    if (device.lastIp && ip && device.lastIp !== ip) {
      await this.audit(
        `user:${device.userId}`,
        'TRUSTED_DEVICE_IP_CHANGED',
        ip,
      );
    }
    await this.prisma.momentTrustedDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date(), lastIp: ip },
    });
    await this.audit(`user:${device.userId}`, 'TRUSTED_DEVICE_SUCCESS', ip);
    return {
      token: await this.createAccessToken(
        device.userId,
        device.user.username,
        device.id,
      ),
      expiresIn: 7200,
    };
  }

  async trustedDevices(userId: string) {
    return this.prisma.momentTrustedDevice.findMany({
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

  async revokeTrustedDevice(userId: string, id: string, ip?: string) {
    const result = await this.prisma.momentTrustedDevice.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      await this.audit(`user:${userId}`, 'TRUSTED_DEVICE_REVOKED', ip);
    }
    return { revoked: result.count > 0 };
  }

  async revokeTrustedToken(rawToken: string, ip?: string) {
    const [id, secret, ...extra] = rawToken.split('.');
    if (!id || !secret || extra.length > 0) return { revoked: false };
    const device = await this.prisma.momentTrustedDevice.findUnique({
      where: { id },
    });
    if (!device || !verifySha256(secret, device.tokenHash)) {
      return { revoked: false };
    }
    return this.revokeTrustedDevice(device.userId, device.id, ip);
  }

  async verifyAdminToken(token: string) {
    const payload = await this.auth.verifyScopedToken<{
      sub: string;
      username: string;
      scope: string;
      amr: string[];
      trustedDeviceId?: string;
    }>(token);
    if (payload.scope !== 'moment:admin' || !payload.amr?.includes('otp')) {
      throw new UnauthorizedException('需要 Moment 强认证');
    }
    if (payload.trustedDeviceId) {
      const device = await this.prisma.momentTrustedDevice.findUnique({
        where: { id: payload.trustedDeviceId },
        select: { userId: true, revokedAt: true, expiresAt: true },
      });
      if (
        !device ||
        device.userId !== payload.sub ||
        device.revokedAt ||
        device.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException('可信设备会话已失效');
      }
    }
    return payload;
  }

  private async createTrustedDevice(
    userId: string,
    userAgent?: string,
    ip?: string,
  ) {
    const identity = deviceIdentity(userAgent);
    const secret = randomToken(32);
    const device = await this.prisma.momentTrustedDevice.create({
      data: {
        userId,
        tokenHash: sha256(secret),
        deviceLabel: identity.label,
        deviceSignature: identity.signature,
        lastIp: ip,
        expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS),
      },
      select: { id: true },
    });
    await this.audit(`user:${userId}`, 'TRUSTED_DEVICE_CREATED', ip);
    return { id: device.id, token: `${device.id}.${secret}` };
  }

  private createAccessToken(
    userId: string,
    username: string,
    trustedDeviceId?: string,
  ) {
    return this.auth.signScopedToken(
      {
        sub: userId,
        username,
        scope: 'moment:admin',
        amr: ['pwd', 'otp'],
        ...(trustedDeviceId ? { trustedDeviceId } : {}),
      },
      '2h',
    );
  }

  private async audit(actor: string, action: string, ip?: string) {
    await this.prisma.momentAuditLog.create({ data: { actor, action, ip } });
  }
}
