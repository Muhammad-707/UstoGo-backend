import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. */
export class ReportNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.REPORT_NOT_FOUND, 'That report does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 422. §6.8: a user cannot file a report against themselves. */
export class CannotReportSelfException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CANNOT_REPORT_SELF,
      'You cannot report yourself.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 409. Resolving an already-resolved/rejected report is not idempotent — a second
 *  admin finding it already handled should see that explicitly. */
export class ReportAlreadyResolvedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.REPORT_ALREADY_RESOLVED,
      'That report has already been resolved.',
      HttpStatus.CONFLICT,
    );
  }
}
