import { createHash } from 'node:crypto';

import { durationToSeconds } from '@common/utils/duration.util';

import { AUTH } from '../constants/auth.constants';
import {
  generateRefreshToken,
  generateResetToken,
  hashToken,
  tokenHashEquals,
} from '../domain/refresh-token.util';

describe('generateRefreshToken', () => {
  it('carries the documented 512 bits of entropy', () => {
    expect(Buffer.from(generateRefreshToken(), 'base64url')).toHaveLength(AUTH.REFRESH_TOKEN_BYTES);
  });

  it('is url-safe, so it survives an email link and a query string', () => {
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));

    expect(seen.size).toBe(200);
  });
});

describe('generateResetToken', () => {
  it('carries 256 bits of entropy', () => {
    expect(Buffer.from(generateResetToken(), 'base64url')).toHaveLength(AUTH.RESET_TOKEN_BYTES);
  });
});

describe('hashToken', () => {
  it('is SHA-256 hex', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('is deterministic — the lookup depends on it', () => {
    expect(hashToken('same-token')).toBe(hashToken('same-token'));
  });

  // The stored value must not be the credential: a database dump should yield no
  // usable sessions (AUTHENTICATION.md §1).
  it('does not contain the raw token', () => {
    const raw = generateRefreshToken();

    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe('tokenHashEquals', () => {
  it('accepts identical hashes', () => {
    expect(tokenHashEquals(hashToken('a'), hashToken('a'))).toBe(true);
  });

  it('rejects different hashes', () => {
    expect(tokenHashEquals(hashToken('a'), hashToken('b'))).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch, and the throw would itself be a
  // signal; the length check has to come first.
  it('returns false rather than throwing on a length mismatch', () => {
    expect(() => tokenHashEquals('short', hashToken('a'))).not.toThrow();
    expect(tokenHashEquals('short', hashToken('a'))).toBe(false);
  });
});

describe('durationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['24h', 86_400],
    ['900s', 900],
    ['500ms', 0.5],
  ])('converts %s to %i seconds', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it.each(['15', 'abc', '', '15x'])('rejects %p', (input) => {
    expect(() => durationToSeconds(input)).toThrow('Unsupported duration');
  });
});
