import {
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  matchedTotpStep,
  verifyTotp,
} from './moment-crypto';

describe('Moment crypto', () => {
  it('validates a standard TOTP vector and rejects a wrong code', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(matchedTotpStep(secret, '287082', 59_000)).toBe(1);
    expect(verifyTotp(secret, '000000', 59_000)).toBe(false);
  });

  it('encrypts secrets with authenticated encryption', () => {
    const encrypted = encryptSecret('TOPSECRET', 'independent-test-key');
    expect(encrypted).not.toContain('TOPSECRET');
    expect(decryptSecret(encrypted, 'independent-test-key')).toBe('TOPSECRET');
    expect(() => decryptSecret(encrypted, 'wrong-key')).toThrow();
  });

  it('creates unique human-readable recovery codes', () => {
    const codes = createRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(
      codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(code)),
    ).toBe(true);
  });
});
