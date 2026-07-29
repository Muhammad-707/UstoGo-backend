import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AppRequest } from '../types/app-request.type';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * The only sanctioned way to read the caller (AUTHORIZATION.md §2.4).
 *
 * Non-null by contract: `JwtAuthGuard` is global, so a handler reached without a user
 * is a `@Public()` route, and reading the caller there is the bug — not this assertion.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    return request.user as AuthenticatedUser;
  },
);
