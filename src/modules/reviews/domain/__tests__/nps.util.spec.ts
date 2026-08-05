import { computeNps } from '../nps.util';

describe('computeNps', () => {
  it('returns null nps and zero counts for no data', () => {
    expect(computeNps([])).toEqual({
      promoters: 0,
      passives: 0,
      detractors: 0,
      responseCount: 0,
      nps: null,
    });
  });

  it('classifies 9–10 as promoter, 7–8 as passive, 0–6 as detractor', () => {
    const result = computeNps([10, 9, 8, 7, 6, 0]);

    expect(result.promoters).toBe(2);
    expect(result.passives).toBe(2);
    expect(result.detractors).toBe(2);
    expect(result.responseCount).toBe(6);
  });

  it('computes %promoters - %detractors, rounded to the nearest whole number', () => {
    // 3 promoters, 0 passives, 1 detractor out of 4 → (3-1)/4 = 50%
    expect(computeNps([9, 10, 10, 0]).nps).toBe(50);
  });

  it('is -100 when every response is a detractor', () => {
    expect(computeNps([0, 1, 2]).nps).toBe(-100);
  });

  it('is 100 when every response is a promoter', () => {
    expect(computeNps([9, 10]).nps).toBe(100);
  });

  it('is 0 when promoters and detractors balance out', () => {
    expect(computeNps([10, 0]).nps).toBe(0);
  });
});
