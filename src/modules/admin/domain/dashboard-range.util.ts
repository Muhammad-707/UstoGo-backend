/**
 * FR-11.1 gives `?from=&to=` as independently optional. Judgment call (CLAUDE.md §3,
 * no document times this the way FR-6.3 times availability): a missing bound defaults
 * to a 30-day window anchored on whichever bound was given (or `now`, if neither was),
 * and the resolved span is capped at 366 days — long enough for a year-over-year
 * report, short enough that the bookings/reviews aggregates below stay index-bound
 * range scans rather than full-table ones.
 */
export const DASHBOARD_DEFAULT_RANGE_DAYS = 30;
export const DASHBOARD_MAX_RANGE_DAYS = 366;

const MS_PER_DAY = 86_400_000;

export interface DashboardRange {
  from: Date;
  to: Date;
}

export const isValidDashboardRange = (from: Date, to: Date): boolean =>
  from.getTime() <= to.getTime() &&
  (to.getTime() - from.getTime()) / MS_PER_DAY <= DASHBOARD_MAX_RANGE_DAYS;

export const resolveDashboardRange = (
  from?: string,
  to?: string,
  now: Date = new Date(),
): DashboardRange => {
  const resolvedTo = to !== undefined ? new Date(to) : now;
  const resolvedFrom =
    from !== undefined
      ? new Date(from)
      : new Date(resolvedTo.getTime() - DASHBOARD_DEFAULT_RANGE_DAYS * MS_PER_DAY);

  return { from: resolvedFrom, to: resolvedTo };
};
