import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global `JwtAuthGuard`.
 *
 * Opt-out rather than opt-in, deliberately: forgetting a decorator then produces a
 * locked endpoint instead of an open one. Fail-closed is the only acceptable default
 * (AUTHORIZATION.md §2.1), and every use of this is justified in review.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
