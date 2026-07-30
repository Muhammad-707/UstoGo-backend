import type { PrismaService } from '@prisma-lib/prisma.service';

/**
 * Local to this module rather than imported from `bookings/services/profile-lookup.util`
 * — the same three-line lookup, but reaching into another feature module's internal
 * (unexported) file would couple `ChatModule` to `BookingsModule`'s file layout instead
 * of its public API (ARCHITECTURE.md §4: modules depend on each other's providers, not
 * their internals).
 */
export const masterProfileFor = async (
  prisma: PrismaService,
  userId: string,
): Promise<{ id: string; userId: string; displayName: string } | null> =>
  prisma.db.masterProfile.findUnique({
    where: { userId },
    select: { id: true, userId: true, displayName: true },
  });

export const clientProfileFor = async (
  prisma: PrismaService,
  userId: string,
): Promise<{ id: string; userId: string; firstName: string; lastName: string } | null> =>
  prisma.db.clientProfile.findUnique({
    where: { userId },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });
