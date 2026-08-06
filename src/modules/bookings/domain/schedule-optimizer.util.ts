/**
 * Greedy nearest-neighbor route ordering for a master's same-day jobs (discovery/
 * gamification-adjacent convenience, not a routing product). A real TSP solver is
 * out of scope for a handful of daily stops; nearest-neighbor is a well-known, simple
 * approximation that is good enough here — pure, so it is trivially unit-testable.
 */
export type OptimizableStop = {
  bookingId: string;
  scheduledAt: Date;
  latitude: number | null;
  longitude: number | null;
};

type LocatedStop = OptimizableStop & { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const haversineKm = (a: LocatedStop, b: LocatedStop): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLng * sinLng;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const hasCoords = (stop: OptimizableStop): stop is LocatedStop =>
  stop.latitude !== null && stop.longitude !== null;

const nearestIndexTo = (from: LocatedStop, candidates: readonly LocatedStop[]): number => {
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (const [index, candidate] of candidates.entries()) {
    const distance = haversineKm(from, candidate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
};

/**
 * Stops without coordinates (no lat/lng captured on that booking) keep their
 * chronological position, appended after the routed stops — they cannot be placed
 * in a route that has no notion of where they are.
 */
export const optimizeRoute = (stops: readonly OptimizableStop[]): OptimizableStop[] => {
  const located = stops.filter(hasCoords);
  const unlocated = stops
    .filter((stop) => !hasCoords(stop))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  if (located.length <= 1) {
    return [...stops].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  const sorted = [...located].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const [first, ...rest] = sorted as [LocatedStop, ...LocatedStop[]];
  const route: LocatedStop[] = [first];
  let current = first;
  let remaining = rest;

  while (remaining.length > 0) {
    const index = nearestIndexTo(current, remaining);
    const next = remaining[index] as LocatedStop;
    route.push(next);
    current = next;
    remaining = remaining.filter((_, i) => i !== index);
  }

  return [...route, ...unlocated];
};

export const routeDistanceKm = (stops: readonly OptimizableStop[]): number => {
  const located = stops.filter(hasCoords);
  let total = 0;
  for (let i = 1; i < located.length; i += 1) {
    total += haversineKm(located[i - 1] as LocatedStop, located[i] as LocatedStop);
  }

  return Math.round(total * 10) / 10;
};
