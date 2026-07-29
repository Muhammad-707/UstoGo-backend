import type { UserRole } from '@prisma/client';

/**
 * The caller, as every guard and service sees them. Reached only through
 * `@CurrentUser()` — services never receive a raw request object (AUTHORIZATION.md §2.4).
 *
 * Deliberately minimal. Mutable state such as `approvalStatus` is **not** here: it can
 * change during a token's lifetime, so anything depending on it re-reads from the
 * database rather than trusting a claim minted minutes ago (AUTHORIZATION.md §2.3).
 */
export type AuthenticatedUser = {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  /**
   * Refresh-token family id, from the `sid` claim. Identifies *this session* rather
   * than this token, which is what lets a password change revoke every other device
   * while sparing the one the change was made on — the token itself rotates, the
   * family does not.
   */
  readonly sessionId: string;
};
