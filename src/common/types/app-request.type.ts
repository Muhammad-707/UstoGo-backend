import type { Request } from 'express';

import type { AuthenticatedUser } from './authenticated-user.type';

/**
 * An Express request with the properties this application attaches to it.
 *
 * An explicit intersection rather than a `declare module` augmentation of
 * `express-serve-static-core`. A global augmentation only applies when the file
 * declaring it is part of the compilation, which is true under `tsc --noEmit` but not
 * under tools that compile file-by-file from an entry point — ts-node dropped it and
 * the OpenAPI export failed to compile while the typecheck stayed green. Naming the
 * type at each use site cannot fail that way, and it makes the dependency visible.
 *
 * Both properties are optional by contract: `requestId` is set by
 * `RequestIdMiddleware`, and `user` only by `JwtAuthGuard` — a `@Public()` route
 * legitimately has none, so typing it as required would make every public handler lie.
 */
export type AppRequest = Request & {
  requestId?: string;
  user?: AuthenticatedUser;
};
