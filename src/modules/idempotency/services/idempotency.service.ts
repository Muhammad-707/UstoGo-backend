import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import {
  IdempotencyKeyInProgressException,
  IdempotencyKeyReusedException,
} from '../exceptions/idempotency.exceptions';

const TTL_MS = 24 * 60 * 60 * 1000;
/** Postgres unique-violation code (`prisma-exception.mapper.ts` maps the same one). */
const UNIQUE_VIOLATION = 'P2002';

export type StoredResponse = {
  readonly status: number;
  readonly body: unknown;
};

/**
 * Backs `IdempotencyInterceptor`. Owns the one table it touches directly, per
 * `ARCHITECTURE.md` §7 — nothing else reads `idempotency_keys`.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called before the handler runs.
   *
   * Returns the stored response if this exact request already completed (a genuine
   * retry) — the handler must not run again. Returns `null` to mean "proceed": this
   * row is new, so the caller owns running the handler and must call `complete` or
   * `abandon` on it.
   *
   * @throws {IdempotencyKeyInProgressException} another request with this key has not
   *   finished yet — the unique constraint on `(userId, key)` is what makes this a
   *   race on the *insert*, never on two handlers running concurrently.
   * @throws {IdempotencyKeyReusedException} this key was already used for a request
   *   with a different method, path or body.
   */
  async begin(options: {
    readonly userId: string;
    readonly key: string;
    readonly method: string;
    readonly path: string;
    readonly requestHash: string;
  }): Promise<StoredResponse | null> {
    const { userId, key, method, path, requestHash } = options;

    try {
      await this.prisma.db.idempotencyKey.create({
        data: {
          userId,
          key,
          method,
          path,
          requestHash,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });

      return null;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== UNIQUE_VIOLATION
      ) {
        throw error;
      }

      const existing = await this.prisma.db.idempotencyKey.findUniqueOrThrow({
        where: { userId_key: { userId, key } },
      });

      if (
        existing.requestHash !== requestHash ||
        existing.method !== method ||
        existing.path !== path
      ) {
        throw new IdempotencyKeyReusedException();
      }

      if (existing.responseStatus === null) {
        throw new IdempotencyKeyInProgressException();
      }

      return { status: existing.responseStatus, body: existing.responseBody };
    }
  }

  /** The handler succeeded — store its response so a retry can be replayed verbatim. */
  async complete(userId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.prisma.db.idempotencyKey.update({
      where: { userId_key: { userId, key } },
      data: { responseStatus: status, responseBody: body as Prisma.InputJsonValue },
    });
  }

  /** The handler threw — delete the placeholder so the same key can be retried. */
  async abandon(userId: string, key: string): Promise<void> {
    await this.prisma.db.idempotencyKey.deleteMany({
      where: { userId, key, responseStatus: null },
    });
  }
}
