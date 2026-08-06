/**
 * Domain events (ARCHITECTURE.md §5, matching `BOOKING_EVENT`). `QuotesService` never
 * calls `NotificationsModule` directly; it only emits these, after commit.
 */
export const QUOTE_EVENT = Object.freeze({
  REQUESTED: 'quote.requested',
  RESPONDED: 'quote.responded',
  DECLINED: 'quote.declined',
} as const);

export class QuoteRequestedEvent {
  constructor(
    readonly quoteId: string,
    readonly masterUserId: string,
    readonly clientDisplayName: string,
  ) {}
}

export class QuoteRespondedEvent {
  constructor(
    readonly quoteId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
    readonly estimatedPrice: string,
  ) {}
}

export class QuoteDeclinedEvent {
  constructor(
    readonly quoteId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
    readonly reason: string,
  ) {}
}
