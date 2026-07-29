import { Module } from '@nestjs/common';

import { CleanupUnconfirmedFilesJob } from './cleanup-unconfirmed-files.job';

/**
 * Scheduled work (ARCHITECTURE.md §9).
 *
 * Jobs call the same services HTTP handlers do and hold no business logic of their own.
 * They are currently safe to run on a single instance only; multi-instance safety
 * (advisory locks or `FOR UPDATE SKIP LOCKED`) lands with the jobs that mutate booking
 * state in Phase 4, where a double run would be visible to users.
 */
@Module({
  providers: [CleanupUnconfirmedFilesJob],
})
export class JobsModule {}
