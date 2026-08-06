import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

import {
  QUOTE_EVENT,
  type QuoteDeclinedEvent,
  type QuoteRequestedEvent,
  type QuoteRespondedEvent,
} from '@modules/quotes/events/quote.events';

import { NotificationsService } from '../services/notifications.service';

/** B-44: one row per quote-lifecycle event. `QuotesModule` never imports this module. */
@Injectable()
export class QuoteNotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(QUOTE_EVENT.REQUESTED)
  async onRequested(event: QuoteRequestedEvent): Promise<void> {
    await this.notifications.create(event.masterUserId, NotificationType.QUOTE_REQUESTED, {
      quoteId: event.quoteId,
      clientName: event.clientDisplayName,
    });
  }

  @OnEvent(QUOTE_EVENT.RESPONDED)
  async onResponded(event: QuoteRespondedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.QUOTE_RESPONDED, {
      quoteId: event.quoteId,
      masterName: event.masterDisplayName,
      estimatedPrice: event.estimatedPrice,
    });
  }

  @OnEvent(QUOTE_EVENT.DECLINED)
  async onDeclined(event: QuoteDeclinedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.QUOTE_DECLINED, {
      quoteId: event.quoteId,
      masterName: event.masterDisplayName,
      reason: event.reason,
    });
  }
}
