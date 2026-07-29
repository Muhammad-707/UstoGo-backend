/**
 * Pure, no I/O — the diff redactor SECURITY.md §2.9 requires. Mirrors the leaf key
 * names in `REDACTED_PATHS` (`shared/logger/logger.module.ts`), which uses pino's own
 * path syntax and so cannot be reused directly on an arbitrary before/after object.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'resetToken',
]);

const REDACTED = '[REDACTED]';

/** Deep, key-name-based redaction for audit `before`/`after` payloads. */
export const redactSensitiveFields = (value: unknown): unknown => {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(key) ? REDACTED : redactSensitiveFields(nested),
    ]),
  );
};
