import { CategoryNotFoundException } from '@modules/categories/exceptions/categories.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { MasterNotFoundException } from '../../exceptions/masters.exceptions';
import { PricingSuggestionService } from '../pricing-suggestion.service';

const priceRows = (values: number[]) => values.map((price) => ({ price }));

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    category?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1', cityId: 'city-1' }),
        ...overrides.masterProfile,
      },
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cat-1' }),
        ...overrides.category,
      },
      service: {
        findMany: jest.fn().mockResolvedValue(priceRows([40, 50, 60, 70, 80])),
        ...overrides.service,
      },
    },
  } as unknown as PrismaService;

  return { service: new PricingSuggestionService(prisma), prisma };
};

describe('PricingSuggestionService.suggest', () => {
  it('throws MasterNotFoundException for a non-master caller', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.suggest('user-1', 'cat-1')).rejects.toThrow(MasterNotFoundException);
  });

  it('throws CategoryNotFoundException for an unknown category', async () => {
    const { service } = build({ category: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.suggest('user-1', 'cat-1')).rejects.toThrow(CategoryNotFoundException);
  });

  it('uses the CITY basis when the city sample meets the minimum', async () => {
    const { service } = build();

    const result = await service.suggest('user-1', 'cat-1');

    expect(result.basis).toBe('CITY');
    expect(result.sampleSize).toBe(5);
    expect(result.suggestedMin).toBe('40.00');
    expect(result.suggestedMax).toBe('80.00');
  });

  it('falls back to CATEGORY_WIDE when the city sample is too small', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(priceRows([50])) // city sample: below MIN_CITY_SAMPLE
      .mockResolvedValueOnce(priceRows([30, 40, 50])); // category-wide fallback
    const { service } = build({ service: { findMany } });

    const result = await service.suggest('user-1', 'cat-1');

    expect(result.basis).toBe('CATEGORY_WIDE');
    expect(result.sampleSize).toBe(3);
  });

  it('returns nulls with a zero sample when nothing matches', async () => {
    const { service } = build({ service: { findMany: jest.fn().mockResolvedValue([]) } });

    const result = await service.suggest('user-1', 'cat-1');

    expect(result.sampleSize).toBe(0);
    expect(result.suggestedMin).toBeNull();
  });
});
