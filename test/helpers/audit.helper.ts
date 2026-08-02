import type { PrismaService } from '@prisma-lib/prisma.service';

/**
 * `AuditInterceptor` writes the row after the response has already been sent (a
 * fire-and-forget `tap`, by design — the caller must not wait on a side effect of
 * their own request). A test asserting on that row immediately after the response
 * is therefore racing it; this polls briefly instead of asserting on the first read.
 */
export const pollAuditLogs = async (
  prisma: PrismaService,
  entityId: string,
): Promise<
  {
    id: string;
    action: string;
    actorUserId: string | null;
  }[]
> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const logs = await prisma.db.auditLog.findMany({ where: { entityId } });
    if (logs.length > 0) {
      return logs;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return [];
};
