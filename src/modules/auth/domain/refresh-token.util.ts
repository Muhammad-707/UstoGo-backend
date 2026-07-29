import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AUTH } from '../constants/auth.constants';

/**
 * Pure token primitives. No framework, no I/O — the layer the rest of auth is built on
 * and the one that can be tested exhaustively (ARCHITECTURE.md §2).
 */

/** A 512-bit opaque value. Returned to the client exactly once and never logged. */
export const generateRefreshToken = (): string =>
  randomBytes(AUTH.REFRESH_TOKEN_BYTES).toString('base64url');

/** A 256-bit value for password reset; travels only in the outbound email. */
export const generateResetToken = (): string =>
  randomBytes(AUTH.RESET_TOKEN_BYTES).toString('base64url');

/**
 * SHA-256, not bcrypt.
 *
 * These tokens are already 256+ bits of uniform randomness, so there is nothing to
 * brute-force and a slow hash would only add latency to every refresh. bcrypt is for
 * passwords, which are low-entropy by nature.
 */
export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Constant-time comparison of two token hashes.
 *
 * Lookups go through the unique index on `tokenHash`, so this is not on the hot path;
 * it exists for the places that compare a computed hash against a stored one, where a
 * short-circuiting `===` leaks how many leading characters matched.
 */
export const tokenHashEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  return left.length === right.length && timingSafeEqual(left, right);
};
