import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

import { DASHBOARD_MAX_RANGE_DAYS } from '../domain/dashboard-range.util';

/** 422. `to` before `from`, or the resolved span exceeds `DASHBOARD_MAX_RANGE_DAYS`. */
export class DashboardRangeInvalidException extends AppException {
  constructor() {
    super(
      ERROR_CODE.DATE_RANGE_TOO_LARGE,
      `The dashboard date range must have "to" on or after "from" and span at most ${String(DASHBOARD_MAX_RANGE_DAYS)} days.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
