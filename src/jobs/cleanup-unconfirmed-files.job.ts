import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '@prisma-lib/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '@shared/storage/storage.provider';

import {
  CLEANUP_BATCH_SIZE,
  UNCONFIRMED_TTL_HOURS,
} from '../modules/files/constants/file.constants';

/**
 * Reclaims object storage that nothing references any more (ARCHITECTURE.md §9).
 *
 * Two populations, both of which leak objects if left alone:
 *   - presigns the client abandoned, older than the confirmation window;
 *   - files released by a replacement, such as the avatar swapped out by a new upload
 *     (FR-3.3: "the previous avatar object is scheduled for deletion").
 *
 * The object is deleted before the row, so a failure between the two leaves a row to
 * retry from rather than an orphan nothing points at.
 *
 * Reads through the **unfiltered** client on purpose: `File` is soft-deletable, so the
 * default client would hide exactly the rows this job exists to collect.
 *
 * Idempotent and safe to run twice — the query only ever selects rows that still
 * qualify.
 */
@Injectable()
export class CleanupUnconfirmedFilesJob {
  private readonly logger = new Logger(CleanupUnconfirmedFilesJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'cleanup-unconfirmed-files' })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - UNCONFIRMED_TTL_HOURS * 3_600_000);

    const stale = await this.prisma.file.findMany({
      where: {
        OR: [
          { isConfirmed: false, createdAt: { lt: cutoff }, deletedAt: null },
          { deletedAt: { not: null } },
        ],
      },
      select: { id: true, key: true },
      take: CLEANUP_BATCH_SIZE,
    });

    if (stale.length === 0) {
      return;
    }

    // Sequential rather than batched: each delete is an independent network call to the
    // object store, and a burst of them competes with real upload traffic for no gain
    // on a job that runs hourly.
    for (const file of stale) {
      await this.storage.remove(file.key);
    }

    const { count } = await this.prisma.file.deleteMany({
      where: { id: { in: stale.map((file) => file.id) } },
    });

    this.logger.log(`Reclaimed ${String(count)} unreferenced uploads`);
  }
}
