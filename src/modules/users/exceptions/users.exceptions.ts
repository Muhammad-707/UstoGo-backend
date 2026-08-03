import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException, type ErrorDetail } from '@common/exceptions/app.exception';

/** 404. The account no longer resolves — deleted, or never existed. */
export class UserNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.USER_NOT_FOUND, 'That user does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 404. */
export class CityNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.CITY_NOT_FOUND, 'That city does not exist.', HttpStatus.NOT_FOUND);
  }
}

/**
 * 422. A field was supplied that the caller's role has no place for — a client sending
 * `displayName`, say.
 *
 * Rejected rather than ignored. Silently dropping a field is how a client ships a
 * feature that appears to work and never persists anything, which is the same failure
 * `forbidNonWhitelisted` prevents one layer up (VALIDATION.md §1).
 */
export class FieldNotApplicableException extends AppException {
  constructor(fields: readonly string[], role: string) {
    super(
      ERROR_CODE.VALIDATION_FAILED,
      'Request validation failed',
      HttpStatus.UNPROCESSABLE_ENTITY,
      fields.map((field): ErrorDetail => ({
        field,
        constraints: [`${field} does not apply to a ${role} profile`],
      })),
    );
  }
}

/** 422. P0 — a master may change their WhatsApp number at most once per 24 hours. */
export class WhatsappChangeCooldownException extends AppException {
  constructor() {
    super(
      ERROR_CODE.WHATSAPP_CHANGE_COOLDOWN,
      'WhatsApp number can only be changed once every 24 hours.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
