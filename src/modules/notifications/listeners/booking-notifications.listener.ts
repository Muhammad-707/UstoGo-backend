import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

import {
  BOOKING_EVENT,
  type BookingAcceptedEvent,
  type BookingCancelledEvent,
  type BookingCompletedEvent,
  type BookingCreatedEvent,
  type BookingExpiredEvent,
  type BookingPaymentConfirmedEvent,
  type BookingReminderEvent,
  type BookingRejectedEvent,
  type BookingRescheduledEvent,
  type BookingStartedEvent,
} from '@modules/bookings/events/booking.events';

import { NotificationsService } from '../services/notifications.service';

/**
 * F-11/FR-9.1: one row per booking-lifecycle event. Listens rather than being called —
 * `BookingsModule` never imports this module (MODULES.md › NotificationsModule).
 */
@Injectable()
export class BookingNotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(BOOKING_EVENT.CREATED)
  async onCreated(event: BookingCreatedEvent): Promise<void> {
    await this.notifications.create(event.masterUserId, NotificationType.BOOKING_CREATED, {
      bookingId: event.bookingId,
      clientName: event.clientDisplayName,
      serviceTitle: event.serviceTitle,
      scheduledAt: event.scheduledAt.toISOString(),
    });
  }

  @OnEvent(BOOKING_EVENT.ACCEPTED)
  async onAccepted(event: BookingAcceptedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.BOOKING_ACCEPTED, {
      bookingId: event.bookingId,
      masterName: event.masterDisplayName,
      scheduledAt: event.scheduledAt.toISOString(),
    });
  }

  @OnEvent(BOOKING_EVENT.REJECTED)
  async onRejected(event: BookingRejectedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.BOOKING_REJECTED, {
      bookingId: event.bookingId,
      masterName: event.masterDisplayName,
      reason: event.reason,
    });
  }

  @OnEvent(BOOKING_EVENT.STARTED)
  async onStarted(event: BookingStartedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.BOOKING_STARTED, {
      bookingId: event.bookingId,
      masterName: event.masterDisplayName,
    });
  }

  @OnEvent(BOOKING_EVENT.COMPLETED)
  async onCompleted(event: BookingCompletedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.BOOKING_COMPLETED, {
      bookingId: event.bookingId,
      masterName: event.masterDisplayName,
    });
    // FR-7.4: completion also invites a review — a second, distinct notification type.
    await this.notifications.create(event.clientUserId, NotificationType.REVIEW_INVITATION, {
      bookingId: event.bookingId,
      masterName: event.masterDisplayName,
    });
  }

  @OnEvent(BOOKING_EVENT.CANCELLED)
  async onCancelled(event: BookingCancelledEvent): Promise<void> {
    await this.notifications.create(event.notifyUserId, NotificationType.BOOKING_CANCELLED, {
      bookingId: event.bookingId,
      cancelledByType: event.cancelledByType,
      reason: event.reason,
    });
  }

  @OnEvent(BOOKING_EVENT.EXPIRED)
  async onExpired(event: BookingExpiredEvent): Promise<void> {
    await Promise.all([
      this.notifications.create(event.clientUserId, NotificationType.BOOKING_EXPIRED, {
        bookingId: event.bookingId,
      }),
      this.notifications.create(event.masterUserId, NotificationType.BOOKING_EXPIRED, {
        bookingId: event.bookingId,
      }),
    ]);
  }

  @OnEvent(BOOKING_EVENT.REMINDER)
  async onReminder(event: BookingReminderEvent): Promise<void> {
    await this.notifications.create(event.notifyUserId, NotificationType.BOOKING_REMINDER, {
      bookingId: event.bookingId,
      scheduledAt: event.scheduledAt.toISOString(),
    });
  }

  @OnEvent(BOOKING_EVENT.RESCHEDULED)
  async onRescheduled(event: BookingRescheduledEvent): Promise<void> {
    await this.notifications.create(event.notifyUserId, NotificationType.BOOKING_RESCHEDULED, {
      bookingId: event.bookingId,
      previousScheduledAt: event.previousScheduledAt.toISOString(),
      scheduledAt: event.scheduledAt.toISOString(),
    });
  }

  @OnEvent(BOOKING_EVENT.PAYMENT_CONFIRMED)
  async onPaymentConfirmed(event: BookingPaymentConfirmedEvent): Promise<void> {
    await this.notifications.create(event.notifyUserId, NotificationType.PAYMENT_CONFIRMED, {
      bookingId: event.bookingId,
      paidAmount: event.paidAmount,
      price: event.price,
      currency: event.currency,
      note: event.note,
    });
  }
}
