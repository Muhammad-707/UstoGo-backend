import { optimizeRoute, routeDistanceKm, type OptimizableStop } from '../schedule-optimizer.util';

const stop = (
  bookingId: string,
  hour: number,
  latitude: number | null,
  longitude: number | null,
): OptimizableStop => ({
  bookingId,
  scheduledAt: new Date(Date.UTC(2026, 0, 1, hour)),
  latitude,
  longitude,
});

// Roughly Dushanbe-area coordinates, spread out enough to have meaningfully
// different pairwise distances.
const A = stop('a', 9, 38.5598, 68.787); // scheduled first
const B = stop('b', 10, 38.58, 68.79); // very close to A
const C = stop('c', 11, 38.9, 69.6); // far from both

describe('routeDistanceKm', () => {
  it('is 0 for a single stop or an empty list', () => {
    expect(routeDistanceKm([])).toBe(0);
    expect(routeDistanceKm([A])).toBe(0);
  });

  it('sums pairwise haversine distance along the given order', () => {
    const forward = routeDistanceKm([A, B, C]);
    const reversed = routeDistanceKm([C, B, A]);

    expect(forward).toBeGreaterThan(0);
    // Symmetric: the same stops in reverse cover the same total distance.
    expect(forward).toBeCloseTo(reversed, 5);
  });

  it('ignores stops without coordinates', () => {
    const withUnlocated = stop('u', 12, null, null);

    expect(routeDistanceKm([A, withUnlocated, B])).toBe(routeDistanceKm([A, B]));
  });
});

describe('optimizeRoute', () => {
  it('starts from the chronologically earliest stop', () => {
    const [first] = optimizeRoute([C, A, B]);

    expect(first?.bookingId).toBe('a');
  });

  it('visits the nearer stop before the farther one, given a chronological order that would visit far-then-near', () => {
    // B is scheduled after C but is much closer to A than C is.
    const chronological = [A, C, stop('b2', 11, 38.58, 68.79)];

    const optimized = optimizeRoute(chronological);

    expect(optimized.map((s) => s.bookingId)).toEqual(['a', 'b2', 'c']);
  });

  it('never produces a longer route than the plain chronological order', () => {
    const chronological = [A, C, B];

    const optimizedDistance = routeDistanceKm(optimizeRoute(chronological));
    const chronologicalDistance = routeDistanceKm(chronological);

    expect(optimizedDistance).toBeLessThanOrEqual(chronologicalDistance);
  });

  it('appends stops without coordinates after the routed stops, in chronological order', () => {
    const unlocated1 = stop('u1', 8, null, null);
    const unlocated2 = stop('u2', 13, null, null);

    const optimized = optimizeRoute([unlocated2, A, unlocated1, B]);

    expect(optimized.map((s) => s.bookingId)).toEqual(['a', 'b', 'u1', 'u2']);
  });

  it('falls back to chronological order when at most one stop has coordinates', () => {
    const onlyOneLocated = [stop('u1', 12, null, null), A, stop('u2', 8, null, null)];

    const optimized = optimizeRoute(onlyOneLocated);

    expect(optimized.map((s) => s.bookingId)).toEqual(['u2', 'a', 'u1']);
  });
});
