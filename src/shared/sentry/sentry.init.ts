import * as Sentry from '@sentry/node';

/**
 * Error tracking (NFR-O-4, SECURITY.md). `SENTRY_DSN` was validated in
 * `env.schema.ts` and exposed via `AppConfigService` since Phase 1, but nothing ever
 * called `Sentry.init` — an unhandled exception in production had no alerting path
 * beyond the structured Pino logs `GlobalExceptionFilter` already writes.
 *
 * A no-op when the DSN is unset (its documented default), so every environment
 * without one configured — local dev, CI, a preview deploy — behaves exactly as it
 * did before this existed.
 */
export const initSentry = (dsn: string, environment: string): void => {
  if (dsn.length === 0) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    // Tracing is a separate, heavier feature this deployment does not need yet —
    // error capture only.
    tracesSampleRate: 0,
    // Request bodies/headers can carry passwords, refresh tokens and PII
    // (ERROR_HANDLING.md §6's logging policy applies here too). Sentry's default
    // request-data capture is turned off rather than relied on to redact it correctly.
    sendDefaultPii: false,
  });
};

/**
 * Reports an unexpected (5xx) error to Sentry. Isolated behind this function so
 * `GlobalExceptionFilter` — which already has 100% coverage and a locked logging
 * contract — gains one call rather than a hard dependency on the SDK; a test double
 * can stub it without mocking `@sentry/node` itself.
 */
export const captureException = (exception: unknown): void => {
  Sentry.captureException(exception);
};
