import type { UserRole, UserStatus } from '@prisma/client';

/**
 * Access-token claims (AUTHENTICATION.md §2).
 *
 * Carries **no PII** — no email, no name, no phone. A JWT is base64, not encrypted;
 * anything in it is readable by anyone who sees the token, including in a browser's
 * network tab and in any proxy log that records an Authorization header.
 *
 * `role` and `status` are a fast path only. Both are mutable during a token's lifetime,
 * so `JwtStrategy` re-reads them from the database on every request; a claim minted
 * fifteen minutes ago is not evidence about the account now.
 */
export type JwtPayload = {
  /** User id. */
  readonly sub: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  /** Refresh-token family id — enables family-level revocation checks. */
  readonly sid: string;
  readonly iat?: number;
  readonly exp?: number;
  readonly iss?: string;
  readonly aud?: string;
};

/** What `AuthService` signs; the registered claims are added by `JwtService`. */
export type JwtClaims = Pick<JwtPayload, 'sub' | 'role' | 'status' | 'sid'>;
