import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

import { AppModule } from '@/app.module';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { MAIL_PROVIDER, type MailMessage, type MailProvider } from '@shared/mail/mail.provider';

/** Kept in step with `main.ts`; a probe URL must not move when the API is versioned. */
const UNVERSIONED_ROUTES = ['health', 'health/ready'];

export type TestApp = {
  readonly app: INestApplication;
  readonly prisma: PrismaService;
  readonly server: ReturnType<INestApplication['getHttpServer']>;
  /** Every message the application attempted to send, captured instead of relayed. */
  readonly mail: readonly MailMessage[];
  close(): Promise<void>;
};

/**
 * Boots the real application against the containerised database.
 *
 * `AppModule` unmodified, and the same global prefix `main.ts` applies — nothing is
 * stubbed out. An end-to-end test whose pipeline differs from production's proves the
 * pipeline it was given, and the guards, filters and validation pipe registered
 * globally in `CommonModule` are exactly what these tests exist to exercise.
 */
export type TestAppOptions = {
  /**
   * Leave the real `ThrottlerGuard` in place. Off by default.
   *
   * The limits are per-IP and deliberately low — 5 registrations an hour — while every
   * test in the suite arrives from the same address, so a suite that kept them would be
   * asserting the rate limiter over and over instead of the behaviour each test is
   * about. Turning it off here and testing it once, where it *is* the subject
   * (`throttling.e2e-spec.ts`), keeps both honest.
   */
  readonly throttling?: boolean;
};

/**
 * A storage that never accumulates, so every request looks like the first one.
 *
 * The storage rather than the guard: `ThrottlerGuard` is registered under the
 * `APP_GUARD` token, so `overrideGuard(ThrottlerGuard)` has no provider to replace and
 * silently does nothing — which is how this was first written, and the 429s that
 * followed were the only reason anyone noticed. Replacing the storage works regardless
 * of how the guard is wired, and keeps the guard itself in the pipeline.
 */
const NO_ACCUMULATION: ThrottlerStorage = {
  increment: async (): Promise<ThrottlerStorageRecord> =>
    Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

/**
 * Captures every message instead of relaying it — no SMTP relay is reachable from the
 * containers this harness starts, and a reset-password journey has no other way to
 * reach the raw token, which exists only in the outbound email and never in the
 * database (`PasswordResetService`).
 */
const capturingMailProvider = (sink: MailMessage[]): MailProvider => ({
  send: (message) => {
    sink.push(message);
    return Promise.resolve();
  },
});

export const createTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.throttling !== true) {
    builder.overrideProvider(ThrottlerStorage).useValue(NO_ACCUMULATION);
  }

  const mail: MailMessage[] = [];
  builder.overrideProvider(MAIL_PROVIDER).useValue(capturingMailProvider(mail));

  const moduleRef = await builder.compile();

  // The application logger is silenced rather than the module's: an expected 401 in an
  // authorization test is not a problem, and a suite that prints one per assertion
  // trains the reader to ignore the output that does matter.
  const app = moduleRef.createNestApplication({ logger: false });

  app.setGlobalPrefix(app.get(AppConfigService).app.apiPrefix, { exclude: UNVERSIONED_ROUTES });

  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    server: app.getHttpServer(),
    mail,
    close: async () => {
      await app.close();
    },
  };
};

/**
 * Empties every table the tests write to, in one statement.
 *
 * Truncation rather than a transaction per test: the code under test opens its own
 * transactions, and nesting those inside a suite-level one would turn a rollback the
 * service performs into a savepoint release, quietly changing the behaviour being
 * asserted (`TESTING.md` §8).
 *
 * `CASCADE` covers the dependent rows; `RESTART IDENTITY` is harmless here since every
 * key is a uuid, and is included so a future serial column does not leak counts
 * between tests. `cities` is deliberately not truncated — it is reference data the
 * fixtures depend on, seeded once per suite.
 */
export const truncateAll = async (prisma: PrismaService): Promise<void> => {
  // A tagged template with no interpolation — the table list is a fixed literal, and
  // there is no value here for anything to inject through.
  await prisma.$executeRaw`TRUNCATE TABLE "users", "client_profiles", "master_profiles", "refresh_tokens", "password_reset_tokens", "files", "audit_logs" RESTART IDENTITY CASCADE`;
};
