import type { AuthenticatedUser } from './authenticated-user.type';

/**
 * Express request augmentation, in one place.
 *
 * `user` is populated by `JwtAuthGuard` (TODO §1.7) and read only through
 * `@CurrentUser()`. It is optional because `@Public()` routes legitimately have none —
 * typing it as required would make every public handler lie about its own request.
 *
 * `requestId` is set by `RequestIdMiddleware` before any guard runs.
 */
declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: AuthenticatedUser;
  }
}

// A file containing only `declare module` is not a module, and an augmentation in a
// non-module file is treated as a global script. This export keeps it a module so the
// augmentation applies rather than colliding.
export {};
