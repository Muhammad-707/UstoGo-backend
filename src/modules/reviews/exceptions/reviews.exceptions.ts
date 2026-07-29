import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. */
export class ReviewNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.REVIEW_NOT_FOUND, 'That review does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 409. FR-8.1: review attempted on a booking that is not `COMPLETED`. */
export class BookingNotCompletedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.BOOKING_NOT_COMPLETED,
      'Only a completed booking can be reviewed.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. BR-51 — one review per booking; the unique `bookingId` FK is the storage backstop. */
export class ReviewAlreadyExistsException extends AppException {
  constructor() {
    super(
      ERROR_CODE.REVIEW_ALREADY_EXISTS,
      'This booking already has a review.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. FR-8.1: more than 30 days since `Booking.completedAt`. */
export class ReviewWindowClosedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.REVIEW_WINDOW_CLOSED,
      'This booking can no longer be reviewed — the 30-day window has closed.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. FR-8.2: more than 24 hours since the review was created. */
export class ReviewEditWindowClosedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.REVIEW_EDIT_WINDOW_CLOSED,
      'This review can no longer be edited — the 24-hour window has closed.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. FR-8.3: one reply per review. */
export class ReplyAlreadyExistsException extends AppException {
  constructor() {
    super(ERROR_CODE.REPLY_ALREADY_EXISTS, 'This review already has a reply.', HttpStatus.CONFLICT);
  }
}
