/**
 * Domain events (ARCHITECTURE.md §5, matching `AUTH_EVENT`/`MASTER_MODERATION_EVENT`).
 * Emitted after commit, never inside a transaction — a notification for a
 * rolled-back booking is worse than none (CLAUDE.md §9). `BookingsService` never
 * calls `NotificationsModule` directly; it only emits these.
 */
export const BOOKING_EVENT = Object.freeze({
  CREATED: 'booking.created',
  ACCEPTED: 'booking.accepted',
  REJECTED: 'booking.rejected',
  STARTED: 'booking.started',
  COMPLETED: 'booking.completed',
  CANCELLED: 'booking.cancelled',
  EXPIRED: 'booking.expired',
  REMINDER: 'booking.reminder',
  RESCHEDULED: 'booking.rescheduled',
  PAYMENT_CONFIRMED: 'booking.payment_confirmed',
} as const);

export class BookingCreatedEvent {
  constructor(
    readonly bookingId: string,
    readonly masterUserId: string,
    readonly clientDisplayName: string,
    readonly scheduledAt: Date,
    readonly serviceTitle: string,
  ) {}
}

export class BookingAcceptedEvent {
  constructor(
    readonly bookingId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
    readonly scheduledAt: Date,
  ) {}
}

export class BookingRejectedEvent {
  constructor(
    readonly bookingId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
    readonly reason: string,
  ) {}
}

export class BookingStartedEvent {
  constructor(
    readonly bookingId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
  ) {}
}

export class BookingCompletedEvent {
  constructor(
    readonly bookingId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
  ) {}
}

export class BookingCancelledEvent {
  constructor(
    readonly bookingId: string,
    /** The party who was **not** the actor — the one being notified. */
    readonly notifyUserId: string,
    readonly cancelledByType: string,
    readonly reason: string | null,
  ) {}
}

export class BookingExpiredEvent {
  constructor(
    readonly bookingId: string,
    readonly clientUserId: string,
    readonly masterUserId: string,
  ) {}
}

export class BookingReminderEvent {
  constructor(
    readonly bookingId: string,
    readonly notifyUserId: string,
    readonly scheduledAt: Date,
  ) {}
}

export class BookingRescheduledEvent {
  constructor(
    readonly bookingId: string,
    /** The master — the client is always the actor for a reschedule (B-51). */
    readonly notifyUserId: string,
    readonly previousScheduledAt: Date,
    readonly scheduledAt: Date,
  ) {}
}

export class BookingPaymentConfirmedEvent {
  constructor(
    readonly bookingId: string,
    /** The master — the client is always the actor for a payment confirmation. */
    readonly notifyUserId: string,
    readonly paidAmount: string,
    readonly price: string,
    readonly currency: string,
    readonly note: string | null,
  ) {}
}
