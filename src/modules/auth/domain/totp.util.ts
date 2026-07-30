import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 4226 (HOTP) / RFC 6238 (TOTP), implemented directly against `node:crypto` rather
 * than a dependency — the algorithm is a dozen lines once base32 is in hand, and
 * `CLAUDE.md` §5 requires asking before adding one.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20; // 160 bits, RFC 4226 §4's recommended HOTP key size.
const STEP_SECONDS = 30;
const DIGITS = 6;

/** A fresh, random base32 secret. Shown to the caller once, at enrollment. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(SECRET_BYTES));

export const base32Encode = (buffer: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

export const base32Decode = (input: string): Buffer => {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

/** RFC 4226 §5.3. `counter` is an 8-byte big-endian integer. */
const hotp = (secret: Buffer, counter: number): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;

  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
};

/** RFC 6238 §4: the HOTP counter is the number of 30-second steps since the epoch. */
export const totp = (base32Secret: string, at: Date = new Date()): string =>
  hotp(base32Decode(base32Secret), Math.floor(at.getTime() / 1000 / STEP_SECONDS));

/**
 * Accepts the current step and one step either side, so a code generated just before a
 * boundary still verifies against a request that arrives just after it.
 */
export const verifyTotp = (base32Secret: string, code: string, window = 1): boolean => {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const secret = base32Decode(base32Secret);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(secret, counter + offset);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(trimmed, 'utf8');

    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
};

/** `otpauth://` URI an authenticator app scans as a QR code — rendered client-side. */
export const totpUri = (secret: string, email: string, issuer: string): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${String(DIGITS)}&period=${String(STEP_SECONDS)}`;
