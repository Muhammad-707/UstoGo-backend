import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';

/** The client handed to a transaction callback; repositories accept it as `tx`. */
export type PrismaTransaction = Prisma.TransactionClient;

export type TransactionOptions = {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  readonly timeoutMs?: number;
  readonly maxWaitMs?: number;
};

/** Prisma's code for "transaction failed due to a write conflict or a deadlock". */
const WRITE_CONFLICT = 'P2034';

/** ARCHITECTURE.md §6: retried up to 3 times with jittered backoff. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 25;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isWriteConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === WRITE_CONFLICT;

/**
 * Wraps Prisma's interactive transactions so repositories can accept an optional
 * transaction handle without every service knowing about Prisma (ARCHITECTURE.md §6).
 *
 * Retrying is safe *because* the whole callback re-runs: a serialization failure
 * aborts the transaction entirely, so there is no partial state to reconcile. This is
 * also why the callback must contain no side effects outside the database — events are
 * emitted after commit, never inside.
 */
@Injectable()
export class TransactionManager {
  private readonly logger = new Logger(TransactionManager.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    fn: (tx: PrismaTransaction) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, {
          ...(options.isolationLevel !== undefined
            ? { isolationLevel: options.isolationLevel }
            : {}),
          ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
          ...(options.maxWaitMs !== undefined ? { maxWait: options.maxWaitMs } : {}),
        });
      } catch (error) {
        if (!isWriteConflict(error) || attempt === MAX_ATTEMPTS) {
          throw error;
        }

        lastError = error;
        this.logger.warn(
          `Write conflict (${WRITE_CONFLICT}); retrying transaction, attempt ${String(attempt + 1)} of ${String(MAX_ATTEMPTS)}`,
        );
        await sleep(this.backoffFor(attempt));
      }
    }

    // Unreachable: the loop either returns or throws. Present so the function is
    // total rather than relying on the compiler's control-flow analysis.
    throw lastError;
  }

  /**
   * Exponential backoff with full jitter. Without the jitter, every loser of a
   * conflict wakes at the same moment and collides again — the retry storm the
   * backoff was supposed to prevent.
   */
  private backoffFor(attempt: number): number {
    return Math.random() * BASE_BACKOFF_MS * 2 ** (attempt - 1);
  }
}
