import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UnauthorizedException } from '../exceptions/generic.exceptions';

/**
 * Global authentication (AUTHORIZATION.md §2.1).
 *
 * Registered for every route with `@Public()` as the only way out, so forgetting a
 * decorator produces a locked endpoint rather than an open one.
 *
 * Referenced by the strategy *name* rather than by importing it, which is what lets
 * this live in `common/` without importing from `modules/` (FOLDER_STRUCTURE.md §7.2).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic === true ? true : super.canActivate(context);
  }

  /**
   * Passport's default throws its own `UnauthorizedException`, whose body would not
   * carry a registry `code`. Translating here keeps every failure in the one envelope
   * (ERROR_HANDLING.md §1).
   */
  override handleRequest<TUser>(err: unknown, user: TUser): TUser {
    // A strategy that threw for its own reason — a database failure inside
    // JwtStrategy.validate, say — must surface as that failure, not as a 401 claiming
    // the credentials were bad.
    if (err instanceof Error) {
      throw err;
    }
    if (user === false || user === null || user === undefined) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
