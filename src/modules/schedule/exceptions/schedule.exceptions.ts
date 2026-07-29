import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 422. Two working-day rows on the same weekday overlap. */
export class ScheduleOverlapException extends AppException {
  constructor() {
    super(
      ERROR_CODE.SCHEDULE_OVERLAP,
      'Working hours for the same weekday must not overlap.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 422. A working exception is missing valid hours, or `endTime` does not follow `startTime`. */
export class InvalidTimeRangeException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_TIME_RANGE,
      'A non-day-off exception needs a start and end time, with end after start.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 409. One exception per (masterProfileId, date). */
export class ExceptionAlreadyExistsException extends AppException {
  constructor() {
    super(
      ERROR_CODE.EXCEPTION_ALREADY_EXISTS,
      'This master already has a schedule exception for that date.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 422. FR-6.3: availability may only be queried across at most 31 days at once. */
export class DateRangeTooLargeException extends AppException {
  constructor() {
    super(
      ERROR_CODE.DATE_RANGE_TOO_LARGE,
      'The date range must not exceed 31 days.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
