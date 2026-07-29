import { computeRatingAggregate } from '../rating-aggregate';

describe('computeRatingAggregate', () => {
  it('returns zero average and count for an empty set', () => {
    expect(computeRatingAggregate([])).toEqual({ average: 0, count: 0 });
  });

  it('averages a single rating', () => {
    expect(computeRatingAggregate([4])).toEqual({ average: 4, count: 1 });
  });

  it('rounds the average to two decimal places', () => {
    expect(computeRatingAggregate([5, 4, 4])).toEqual({ average: 4.33, count: 3 });
  });

  it('counts every rating in the set', () => {
    expect(computeRatingAggregate([1, 2, 3, 4, 5])).toEqual({ average: 3, count: 5 });
  });
});
