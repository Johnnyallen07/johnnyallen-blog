import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function verifySha256(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomBase32(bytes = 20): string {
  const input = randomBytes(bytes);
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    result += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return result;
}

function decodeBase32(value: string): Buffer {
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 value');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function matchedTotpStep(
  secret: string,
  code: string,
  now = Date.now(),
): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const counter = Math.floor(now / 30_000);
  for (let drift = -1; drift <= 1; drift++) {
    const expected = hotp(secret, counter + drift);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return counter + drift;
    }
  }
  return null;
}

export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
): boolean {
  return matchedTotpStep(secret, code, now) !== null;
}

function encryptionKey(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(secret: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptSecret(payload: string, key: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(key),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function createRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  });
}
