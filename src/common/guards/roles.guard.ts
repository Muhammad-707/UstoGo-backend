import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenException } from '../exceptions/generic.exceptions';
import type { AppRequest } from '../types/app-request.type';

/**
 * Question 2 of the four (AUTHORIZATION.md §1): does the caller's **role** permit this
 * operation?
 *
 * Only the role. Account state belongs to feature guards and ownership belongs to the
 * service layer, where the entity is already loaded — a guard that fetched the resource
 * to decide would load it twice and let the two decisions drift.
 *
 * No `@Roles()` on a protected route means "any authenticated role", which is safe
 * because `JwtAuthGuard` has already run.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AppRequest>();

    if (user === undefined || !required.includes(user.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
