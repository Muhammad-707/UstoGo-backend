import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. */
export class BookingNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.BOOKING_NOT_FOUND, 'That booking does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 409. FR-7.1 #1: the master exists but cannot receive bookings right now. */
export class MasterUnavailableException extends AppException {
  constructor() {
    super(
      ERROR_CODE.MASTER_UNAVAILABLE,
      'That master is not currently accepting bookings.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 422. FR-7.1 #2: the service does not belong to the master, or is inactive. */
export class ServiceInvalidException extends AppException {
  constructor() {
    super(
      ERROR_CODE.SERVICE_INVALID,
      'That service is not offered by this master, or is no longer active.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 422. FR-7.1 #3: less than the 2-hour lead time. */
export class SlotTooSoonException extends AppException {
  constructor() {
    super(
      ERROR_CODE.SLOT_TOO_SOON,
      'Bookings must be made at least 2 hours in advance.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 409. FR-7.1 #4: outside computed availability, or already taken. */
export class SlotNotAvailableException extends AppException {
  constructor() {
    super(ERROR_CODE.SLOT_NOT_AVAILABLE, 'That time slot is not available.', HttpStatus.CONFLICT);
  }
}

/** 409. FR-7.1 #5: the client already has a booking overlapping this window. */
export class ClientSlotConflictException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CLIENT_SLOT_CONFLICT,
      'You already have a booking in that time window.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 429. FR-7.1 #6: more than 5 open PENDING bookings. */
export class TooManyPendingBookingsException extends AppException {
  constructor() {
    super(
      ERROR_CODE.TOO_MANY_PENDING_BOOKINGS,
      'You have too many pending booking requests. Wait for one to be resolved first.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** 409. Not permitted by the state machine — includes acting outside one's role. */
export class IllegalBookingTransitionException extends AppException {
  constructor() {
    super(
      ERROR_CODE.ILLEGAL_BOOKING_TRANSITION,
      'That transition is not permitted from the booking’s current state.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. Lost the race at acceptance — the storage-layer exclusion constraint fired first. */
export class BookingOverlapException extends AppException {
  constructor() {
    super(
      ERROR_CODE.BOOKING_OVERLAP,
      'That time slot was taken by another booking.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 422. FR-7.4: starting earlier than 30 minutes before the scheduled slot. */
export class TooEarlyToStartException extends AppException {
  constructor() {
    super(
      ERROR_CODE.TOO_EARLY_TO_START,
      'This booking cannot be started more than 30 minutes before its scheduled time.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 422. A cancellation/rejection reason is required for this actor. */
export class ReasonRequiredException extends AppException {
  constructor() {
    super(ERROR_CODE.REASON_REQUIRED, 'A reason is required.', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 422. B-51: a reschedule must be requested at least 24h before the current slot. */
export class RescheduleWindowClosedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.RESCHEDULE_WINDOW_CLOSED,
      'This booking can no longer be rescheduled — its slot is less than 24 hours away.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 409. B-51: a booking may be rescheduled once. */
export class RescheduleLimitExceededException extends AppException {
  constructor() {
    super(
      ERROR_CODE.RESCHEDULE_LIMIT_EXCEEDED,
      'This booking has already been rescheduled once. Cancel and rebook instead.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. A COMPLETED booking's payment may be confirmed by the client once. */
export class PaymentAlreadyConfirmedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PAYMENT_ALREADY_CONFIRMED,
      'Payment for this booking has already been confirmed.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 422. `paidAmount` is less than the agreed price — a note explaining why is required. */
export class PaymentNoteRequiredException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PAYMENT_NOTE_REQUIRED,
      'A note is required when the amount paid is less than the agreed price.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 404. An unknown verification code, or a booking with no certificate (not COMPLETED). */
export class CompletionCertificateNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.COMPLETION_CERTIFICATE_NOT_FOUND,
      'That completion certificate does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}
