import { HttpStatus } from '@nestjs/common';

import { AppException, type ErrorDetail } from './app.exception';
import { ERROR_CODE, type ErrorCode } from '../constants/error-codes.constant';

/**
 * The generic subclasses from ERROR_HANDLING.md §2. Feature modules subclass these — or
 * `AppException` directly — with names drawn from their own domain; these exist so that
 * cross-cutting code has something correct to throw without inventing a shape.
 *
 * They live in one file because they are one concept: six three-line classes in six
 * files would be filing, not structure.
 */

/** 422. Raised by the validation pipe; carries the field-level violations. */
export class ValidationFailedException extends AppException {
  constructor(details: readonly ErrorDetail[] = []) {
    super(
      ERROR_CODE.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }
}

/**
 * 404. Also the correct response when a resource exists but is not visible to the
 * caller — returning 403 would confirm that the id is real (AUTHORIZATION.md §1).
 */
export class ResourceNotFoundException extends AppException {
  constructor(code: ErrorCode = ERROR_CODE.NOT_FOUND, message = 'Resource not found') {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

/** 409. The request is well-formed but conflicts with current state. */
export class ConflictException extends AppException {
  constructor(
    code: ErrorCode = ERROR_CODE.CONFLICT,
    message = 'Request conflicts with the current state',
  ) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

/** 401. Missing, malformed or expired credentials. */
export class UnauthorizedException extends AppException {
  constructor(code: ErrorCode = ERROR_CODE.UNAUTHORIZED, message = 'Authentication required') {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

/** 403. Authenticated, but the role or account state does not permit the operation. */
export class ForbiddenException extends AppException {
  constructor(code: ErrorCode = ERROR_CODE.FORBIDDEN, message = 'Operation not permitted') {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

/**
 * 422 or 409. A rule the client could not have known was broken from the payload
 * alone: 422 when the payload itself is unacceptable, 409 when the payload is fine but
 * the world has moved (VALIDATION.md §6).
 */
export class BusinessRuleViolationException extends AppException {
  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus.UNPROCESSABLE_ENTITY | HttpStatus.CONFLICT = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super(code, message, status);
  }
}

/** 400. Reserved for malformed requests the pipe cannot describe field by field. */
export class BadRequestException extends AppException {
  constructor(code: ErrorCode = ERROR_CODE.BAD_REQUEST, message = 'Malformed request') {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}

/** 503. The database or another dependency is unreachable; readiness fails alongside. */
export class ServiceUnavailableException extends AppException {
  constructor(message = 'Service temporarily unavailable') {
    super(ERROR_CODE.SERVICE_UNAVAILABLE, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
