import { sha256 } from './moment-crypto';
import { MomentAuthService } from './moment-auth.service';

describe('MomentAuthService trusted devices', () => {
  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
  const signature = sha256('moment-device-v1:chrome:mac');

  function createService() {
    const prisma = {
      momentTrustedDevice: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      momentAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new MomentAuthService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const createTrustedDevice = (
      service as unknown as {
        createTrustedDevice: (
          userId: string,
          userAgent?: string,
          ip?: string,
          existingTrustedToken?: string,
        ) => Promise<{ id: string; token: string }>;
      }
    ).createTrustedDevice.bind(service);
    return { prisma, createTrustedDevice };
  }

  it('rotates the matching browser credential instead of adding a device', async () => {
    const { prisma, createTrustedDevice } = createService();
    prisma.momentTrustedDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
      tokenHash: sha256('old-secret'),
      deviceSignature: signature,
      revokedAt: null,
    });
    prisma.momentTrustedDevice.update.mockResolvedValue({ id: 'device-1' });

    const result = await createTrustedDevice(
      'user-1',
      userAgent,
      '127.0.0.1',
      'device-1.old-secret',
    );

    expect(result.id).toBe('device-1');
    expect(result.token).toMatch(/^device-1\.[A-Za-z0-9_-]+$/);
    expect(prisma.momentTrustedDevice.create).not.toHaveBeenCalled();
    expect(prisma.momentTrustedDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'device-1' } }),
    );
    expect(prisma.momentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TRUSTED_DEVICE_ROTATED' }),
    });
  });

  it('does not reuse a record when the existing credential is invalid', async () => {
    const { prisma, createTrustedDevice } = createService();
    prisma.momentTrustedDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
      tokenHash: sha256('different-secret'),
      deviceSignature: signature,
      revokedAt: null,
    });
    prisma.momentTrustedDevice.create.mockResolvedValue({ id: 'device-2' });

    const result = await createTrustedDevice(
      'user-1',
      userAgent,
      '127.0.0.1',
      'device-1.old-secret',
    );

    expect(result.id).toBe('device-2');
    expect(prisma.momentTrustedDevice.update).not.toHaveBeenCalled();
    expect(prisma.momentTrustedDevice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });
});
