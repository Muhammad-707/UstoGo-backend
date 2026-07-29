/**
 * Pure (FOLDER_STRUCTURE.md `domain/`) — DATABASE.md §3.3's denormalisation contract:
 * `ratingAverage`/`ratingCount` are recomputed from the current set of `VISIBLE`
 * ratings on every write, edit, hide and unhide, inside the same transaction as the
 * change that caused it.
 */
export const computeRatingAggregate = (
  visibleRatings: readonly number[],
): { average: number; count: number } => {
  if (visibleRatings.length === 0) {
    return { average: 0, count: 0 };
  }

  const sum = visibleRatings.reduce((total, rating) => total + rating, 0);

  return {
    average: Math.round((sum / visibleRatings.length) * 100) / 100,
    count: visibleRatings.length,
  };
};
