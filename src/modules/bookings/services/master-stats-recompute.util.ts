import { Prisma } from '@prisma/client';

import type { PrismaTransaction } from '@prisma-lib/transaction.manager';

/**
 * Recomputed inside the same transaction as the mutation that causes the change,
 * never incrementally — same discipline `ratingAverage` follows (DATABASE.md §3.3).
 * Split out of `BookingTransitionService` to stay under the 300-line file cap; these
 * are free functions rather than methods since neither needs anything but `tx` and
 * `masterProfileId`.
 */

/**
 * Fast-responder badge input. One raw aggregate query rather than loading every row,
 * since `MastersSearchService`'s public projection reads this column for every
 * master in a search result and cannot afford an N+1 here.
 */
export const recomputeAvgAcceptLatency = async (
  tx: PrismaTransaction,
  masterProfileId: string,
): Promise<void> => {
  const [row] = await tx.$queryRaw<{ avgMinutes: number | null }[]>(
    Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM ("accepted_at" - "created_at")) / 60) AS "avgMinutes"
      FROM "bookings"
      WHERE "master_profile_id" = ${masterProfileId}::uuid
        AND "accepted_at" IS NOT NULL
        AND "deleted_at" IS NULL
    `,
  );

  await tx.masterProfile.update({
    where: { id: masterProfileId },
    data: { avgAcceptLatencyMinutes: row?.avgMinutes ?? null },
  });
};

/**
 * B-15/B-24 — `100 * completed / (completed + cancelledByMaster)`. Null (never "0%")
 * until the master has any resolved bookings at all, so an unproven master reads as
 * "no data" rather than "unreliable".
 */
export const recomputeReliabilityScore = async (
  tx: PrismaTransaction,
  masterProfileId: string,
): Promise<void> => {
  const [row] = await tx.$queryRaw<{ completed: bigint; cancelledByMaster: bigint }[]>(
    Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS "completed",
        COUNT(*) FILTER (WHERE status = 'CANCELLED_BY_MASTER') AS "cancelledByMaster"
      FROM "bookings"
      WHERE "master_profile_id" = ${masterProfileId}::uuid
        AND "deleted_at" IS NULL
    `,
  );

  const completed = Number(row?.completed ?? 0n);
  const cancelledByMaster = Number(row?.cancelledByMaster ?? 0n);
  const resolved = completed + cancelledByMaster;
  const score = resolved === 0 ? null : Math.round((completed / resolved) * 10_000) / 100;

  await tx.masterProfile.update({
    where: { id: masterProfileId },
    data: { reliabilityScore: score },
  });
};
