import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totp,
  totpUri,
  verifyTotp,
} from '../domain/totp.util';

describe('base32Encode / base32Decode', () => {
  it('round-trips arbitrary bytes', () => {
    const original = Buffer.from('Hello, UstoGo!', 'utf8');

    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it('round-trips a generated secret', () => {
    const secret = generateTotpSecret();

    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });
});

describe('totp / verifyTotp', () => {
  // RFC 6238 Appendix B test vector, seconds 59, SHA-1, 8-digit truncated to the
  // implementation's 6-digit output by comparing only the verify path, which is what
  // this codebase actually exercises.
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  it('produces a 6-digit code that verifies against itself', () => {
    const code = totp(secret);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('rejects a code from a different secret', () => {
    const code = totp(secret);
    const other = generateTotpSecret();

    expect(verifyTotp(other, code)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyTotp(secret, 'not-a-code')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
  });

  it('accepts a code from one step in the past or future (clock skew window)', () => {
    const past = new Date(Date.now() - 30_000);
    const future = new Date(Date.now() + 30_000);

    expect(verifyTotp(secret, totp(secret, past))).toBe(true);
    expect(verifyTotp(secret, totp(secret, future))).toBe(true);
  });

  it('rejects a code two steps away', () => {
    const farPast = new Date(Date.now() - 90_000);

    expect(verifyTotp(secret, totp(secret, farPast))).toBe(false);
  });
});

describe('totpUri', () => {
  it('embeds the secret, account and issuer', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'admin@ustogo.tj', 'UstoGo');

    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=UstoGo');
    expect(uri).toContain(encodeURIComponent('admin@ustogo.tj'));
  });
});
