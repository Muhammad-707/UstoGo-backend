import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';

import { Roles } from './roles.decorator';
import { ErrorResponseDto } from '../dto/error-response.dto';

export const ACCESS_TOKEN_SCHEME = 'access-token';

/**
 * Sets the guard metadata *and* documents it in one place (SWAGGER_GUIDE.md §5).
 *
 * Because `USER_ROLES.md` is normative, the specification has to reflect enforcement.
 * Applying `@Roles()` and the Swagger annotations from a single decorator means the two
 * cannot drift: there is no way to change the permitted roles without changing the docs.
 */
export const ApiAuth = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiBearerAuth(ACCESS_TOKEN_SCHEME),
    Roles(...roles),
    ApiUnauthorizedResponse({
      description: 'UNAUTHORIZED | TOKEN_EXPIRED',
      type: ErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description:
        roles.length > 0
          ? `FORBIDDEN — requires role: ${roles.join(', ')}`
          : 'FORBIDDEN | ACCOUNT_BLOCKED | ACCOUNT_INACTIVE',
      type: ErrorResponseDto,
    }),
  );
