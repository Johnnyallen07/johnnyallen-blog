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
  sha256,
  verifyTotp,
} from './moment-crypto';

type AdminUser = { id: string; username: string };

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
      throw new UnauthorizedException('验证码不正确');
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

  async login(username: string, password: string, code: string, ip?: string) {
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
    return {
      token: await this.auth.signScopedToken(
        {
          sub: user.id,
          username: user.username,
          scope: 'moment:admin',
          amr: ['pwd', 'otp'],
        },
        '2h',
      ),
      expiresIn: 7200,
    };
  }

  async verifyAdminToken(token: string) {
    const payload = await this.auth.verifyScopedToken<{
      sub: string;
      username: string;
      scope: string;
      amr: string[];
    }>(token);
    if (payload.scope !== 'moment:admin' || !payload.amr?.includes('otp')) {
      throw new UnauthorizedException('需要 Moment 强认证');
    }
    return payload;
  }

  private async audit(actor: string, action: string, ip?: string) {
    await this.prisma.momentAuditLog.create({ data: { actor, action, ip } });
  }
}
