/**
 * Pure, no I/O (ARCHITECTURE.md §2). Mirrors the public-read filter DATABASE.md §12
 * defines: `isActive AND (startsAt IS NULL OR startsAt <= now) AND (endsAt IS NULL OR
 * endsAt >= now)`. `BannersService` builds the equivalent Prisma `where` for the
 * query itself — this is the same rule expressed as a predicate, so the logic has one
 * exhaustively unit-tested definition instead of being trusted to match the SQL.
 */
export type BannerWindow = {
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
};

export const isWithinActiveWindow = (banner: BannerWindow, now: Date): boolean => {
  if (!banner.isActive) {
    return false;
  }
  if (banner.startsAt !== null && banner.startsAt > now) {
    return false;
  }
  if (banner.endsAt !== null && banner.endsAt < now) {
    return false;
  }

  return true;
};
