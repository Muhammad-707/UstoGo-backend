import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may reach a handler. Read by `RolesGuard` (TODO §1.7).
 *
 * Absence means "any authenticated role", not "anyone": authentication is enforced
 * separately by the global `JwtAuthGuard` (AUTHORIZATION.md §2.2).
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
