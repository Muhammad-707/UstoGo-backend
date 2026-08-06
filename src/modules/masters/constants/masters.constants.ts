/** B-45 — a bounded highlight reel, not a full paginated gallery. */
export const PORTFOLIO_IMAGE_LIMIT = 20;

/** B-35 — a handful of canned replies, not an unbounded list. */
export const QUICK_REPLY_LIMIT = 20;

/** A client's browsing history — the most recent distinct masters, not a full log. */
export const RECENTLY_VIEWED_LIMIT = 10;

/**
 * Public "fast responder" badge thresholds. A master needs both a low average
 * acceptance latency and a minimum track record — one lucky quick accept should not
 * earn the badge, matching how `ratingAverage` alone (without `ratingCount`) is never
 * shown as a trust signal elsewhere in this API.
 */
export const FAST_RESPONDER_THRESHOLD_MINUTES = 30;
export const FAST_RESPONDER_MIN_BOOKINGS = 5;
