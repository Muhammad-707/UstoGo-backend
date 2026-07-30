import { z } from 'zod';

import { InvalidEnvironmentException } from './invalid-environment.exception';

/** `15m`, `30d`, `900ms` — the format `jsonwebtoken` and `ms` both accept. */
const DURATION = /^\d+(ms|s|m|h|d)$/;

const duration = (fallback: string) =>
  z.string().regex(DURATION, 'must be a duration such as 15m, 24h or 30d').default(fallback);

// `z.coerce.boolean()` is not usable here: it applies JavaScript truthiness, under which
// the string "false" is true. An explicit two-value enum also rejects "yes" and "0" loudly
// instead of silently reading them as enabled.
const boolish = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

// RS256 access-token keys travel as base64 in a single env var — a raw multi-line PEM
// breaks most .env parsers and shell exports. Validated by round-tripping the decode
// rather than trusting the caller, since a malformed key would otherwise surface as an
// opaque jsonwebtoken error at the first sign attempt instead of at boot.
const base64Pem = (label: 'PRIVATE KEY' | 'PUBLIC KEY') =>
  z
    .string()
    .min(1)
    .refine((value) => {
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        return (
          decoded.includes(`-----BEGIN ${label}-----`) && decoded.includes(`-----END ${label}-----`)
        );
      } catch {
        return false;
      }
    }, `must be a base64-encoded PEM ${label}`);

// Scheme is checked here rather than by chaining .refine() onto z.url(): a chained
// refinement still runs after the URL check fails, so one bad value reports two issues.
// Parsing with the URL constructor is also stricter than z.url()'s pattern match.
const connectionUrl = (schemes: readonly string[], message: string) =>
  z.string().refine((value) => {
    try {
      return schemes.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, message);

export const envSchema = z
  .object({
    // ---- Application ----
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().min(1).default('api/v1'),
    CORS_ORIGINS: z.string().default(''),

    // ---- Database ----
    DATABASE_URL: connectionUrl(
      ['postgresql:', 'postgres:'],
      'must be a postgresql:// connection URL',
    ),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),

    // ---- JWT (AUTHENTICATION.md §11) ----
    // Phase 6: access tokens moved from HS256 (one shared secret) to RS256 (a private
    // key that signs, a public key that verifies) — a service that only needs to verify
    // tokens, or a future key-rotation setup, never needs the private key at all.
    JWT_ACCESS_PRIVATE_KEY: base64Pem('PRIVATE KEY'),
    JWT_ACCESS_PUBLIC_KEY: base64Pem('PUBLIC KEY'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ACCESS_TTL: duration('15m'),
    JWT_REFRESH_TTL: duration('30d'),
    JWT_ISSUER: z.string().min(1).default('ustogo-api'),
    JWT_AUDIENCE: z.string().min(1).default('ustogo-clients'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    PASSWORD_RESET_TTL: duration('30m'),
    // Where the emailed reset link points. The API never serves this page — it belongs
    // to the client application, which posts the token back to /auth/reset-password.
    PASSWORD_RESET_URL: connectionUrl(
      ['http:', 'https:'],
      'must be an http:// or https:// URL',
    ).default('http://localhost:3000/reset-password'),
    EMAIL_VERIFICATION_TTL: duration('24h'),
    // Where the emailed verification link points. Same reasoning as PASSWORD_RESET_URL:
    // the client application owns this page and posts the token to /auth/verify-email.
    EMAIL_VERIFICATION_URL: connectionUrl(
      ['http:', 'https:'],
      'must be an http:// or https:// URL',
    ).default('http://localhost:3000/verify-email'),
    // AES-256-GCM key encrypting the TOTP secret at rest (src/modules/auth/domain/
    // secret-encryption.util.ts) — 64 hex characters, i.e. 32 bytes.
    TOTP_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),
    TOTP_ISSUER: z.string().min(1).default('UstoGo'),
    TWO_FACTOR_CHALLENGE_TTL: duration('5m'),

    // ---- Object storage ----
    S3_ENDPOINT: connectionUrl(['http:', 'https:'], 'must be an http:// or https:// URL'),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_PRESIGN_TTL: z.coerce.number().int().min(60).max(604800).default(900),

    // ---- Mail ----
    MAIL_HOST: z.string().min(1),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    MAIL_USER: z.string().default(''),
    MAIL_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().min(1),

    // ---- Redis ----
    REDIS_URL: connectionUrl(['redis:', 'rediss:'], 'must be a redis:// connection URL'),

    // ---- Throttling (API.md §13) ----
    THROTTLE_TTL: z.coerce.number().int().min(1).default(60),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),

    // ---- Catalogue (BR-24: currency is fixed per deployment; D-3) ----
    SERVICE_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/, 'must be an ISO-4217 3-letter code')
      .default('USD'),

    // ---- Observability ----
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SENTRY_DSN: z.string().default(''),
    SWAGGER_ENABLED: boolish('false'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_PRIVATE_KEY === env.JWT_ACCESS_PUBLIC_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_PUBLIC_KEY'],
        message: 'must differ from JWT_ACCESS_PRIVATE_KEY',
      });
    }

    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.trim() === '*') {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'must not be * in production — list the real origins',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates a raw environment. Pure: it reads nothing and exits nothing, so the
 * failure cases are unit-testable. Callers decide what to do with the exception.
 *
 * @throws {InvalidEnvironmentException} listing every failure, not just the first.
 */
export const parseEnv = (source: Record<string, string | undefined>): Env => {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return Object.freeze(result.data);
  }

  const issues = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return name.length > 0 ? `${name}: ${issue.message}` : issue.message;
  });

  throw new InvalidEnvironmentException(issues);
};
