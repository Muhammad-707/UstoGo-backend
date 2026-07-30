/** Frozen literals from AUTHENTICATION.md. Anything configurable lives in AppConfigService. */
export const AUTH = Object.freeze({
  /** §1 — opaque refresh tokens are 512-bit random values. */
  REFRESH_TOKEN_BYTES: 64,
  /** §8 — reset tokens are 256-bit; only the SHA-256 hash is stored. */
  RESET_TOKEN_BYTES: 32,
  /** Phase 6 — email verification tokens follow the same 256-bit shape as reset tokens. */
  EMAIL_VERIFICATION_TOKEN_BYTES: 32,
  /** §2 — verified, not merely tolerated. */
  CLOCK_SKEW_SECONDS: 30,
  /** §7 — the bcrypt truncation boundary, enforced rather than silently applied. */
  MAX_PASSWORD_BYTES: 72,
  MIN_PASSWORD_LENGTH: 8,
} as const);

/** §4 — why a refresh token stopped being usable. Written, never inferred. */
export const REVOKED_REASON = Object.freeze({
  LOGOUT: 'LOGOUT',
  ROTATION: 'ROTATION',
  REUSE_DETECTED: 'REUSE_DETECTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ADMIN_ACTION: 'ADMIN_ACTION',
} as const);

export type RevokedReason = (typeof REVOKED_REASON)[keyof typeof REVOKED_REASON];
