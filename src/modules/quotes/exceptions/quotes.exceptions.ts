import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. A foreign or unknown quote id, never 403 (AUTHORIZATION.md §1). */
export class QuoteNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.QUOTE_NOT_FOUND, 'That quote does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 409. B-44 — a master may respond to or decline a `PENDING` quote only once. */
export class QuoteAlreadyRespondedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.QUOTE_ALREADY_RESPONDED,
      'This quote has already been responded to.',
      HttpStatus.CONFLICT,
    );
  }
}
