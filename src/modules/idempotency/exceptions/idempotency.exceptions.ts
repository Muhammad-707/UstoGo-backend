import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/**
 * 409. The same `Idempotency-Key` was sent with a request whose method, path or body
 * differs from the one it was first used for — a client bug, not a retry, so replaying
 * the stored response would silently answer the wrong question.
 */
export class IdempotencyKeyReusedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.IDEMPOTENCY_KEY_REUSED,
      'This Idempotency-Key was already used for a different request.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 409. The original request carrying this key is still being processed. The client
 * raced itself — retry after a short delay rather than assuming failure.
 */
export class IdempotencyKeyInProgressException extends AppException {
  constructor() {
    super(
      ERROR_CODE.IDEMPOTENCY_KEY_IN_PROGRESS,
      'A request with this Idempotency-Key is still being processed.',
      HttpStatus.CONFLICT,
    );
  }
}
