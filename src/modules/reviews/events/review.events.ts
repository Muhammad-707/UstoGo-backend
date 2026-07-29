/** Domain events (ARCHITECTURE.md §5) — emitted after commit, never inside. */
export const REVIEW_EVENT = Object.freeze({
  CREATED: 'review.created',
  REPLIED: 'review.replied',
} as const);

export class ReviewCreatedEvent {
  constructor(
    readonly reviewId: string,
    readonly masterUserId: string,
    readonly clientDisplayName: string,
    readonly rating: number,
  ) {}
}

export class ReviewRepliedEvent {
  constructor(
    readonly reviewId: string,
    readonly clientUserId: string,
    readonly masterDisplayName: string,
  ) {}
}
