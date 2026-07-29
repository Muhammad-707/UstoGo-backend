const minutes = (n: number): number => n * 60_000;
const hours = (n: number): number => n * 3_600_000;

/**
 * Per-endpoint rate limits (API.md §13, AUTHENTICATION.md §9).
 *
 * Each name must also be declared in `ThrottlerModule.forRootAsync`; `@Throttle` can
 * only override a throttler that exists.
 */
export const THROTTLE = Object.freeze({
  LOGIN: { limit: 5, ttl: minutes(15) },
  REGISTER: { limit: 5, ttl: hours(1) },
  FORGOT_PASSWORD: { limit: 3, ttl: hours(1) },
  RESET_PASSWORD: { limit: 5, ttl: hours(1) },
  REFRESH: { limit: 30, ttl: hours(1) },
} as const);

/** The global default from API.md §13: 100 requests per minute per IP. */
export const GLOBAL_THROTTLE_NAME = 'default';
