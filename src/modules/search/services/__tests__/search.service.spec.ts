import { MasterSort } from '@modules/masters/dto/requests/master-search-query.dto';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { SearchService } from '../search.service';

const ROW = {
  id: 'm-1',
  displayName: 'Jamshed',
  avatarFileId: null,
  bio: null,
  city: { name: 'Dushanbe' },
  categories: [],
  ratingAverage: { toFixed: () => '4.50' },
  ratingCount: 3,
  completedBookingsCount: 2,
  services: [],
  certificates: [],
  portfolioImages: [],
};

const build = (
  overrides: {
    queryRaw?: jest.Mock;
    findMany?: jest.Mock;
    categoryFindMany?: jest.Mock;
  } = {},
) => {
  const queryRaw =
    overrides.queryRaw ??
    jest
      .fn()
      .mockResolvedValueOnce([{ id: 'm-1' }])
      .mockResolvedValueOnce([{ total: BigInt(1) }]);
  const prisma = {
    db: {
      $queryRaw: queryRaw,
      masterProfile: {
        findMany: overrides.findMany ?? jest.fn().mockResolvedValue([ROW]),
      },
      category: {
        findMany: overrides.categoryFindMany ?? jest.fn().mockResolvedValue([]),
      },
    },
  } as unknown as PrismaService;

  return { service: new SearchService(prisma), prisma, queryRaw };
};

describe('SearchService', () => {
  it('returns an empty page without hydrating when there are no candidate ids', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service, prisma } = build({ queryRaw });

    const result = await service.search({ page: 1, limit: 20, skip: 0 });

    expect(result).toEqual({ items: [], total: 0 });
    expect(prisma.db.masterProfile.findMany).not.toHaveBeenCalled();
  });

  it('hydrates candidate ids into public projections, preserving SQL order', async () => {
    const { service } = build();

    const result = await service.search({ page: 1, limit: 20, skip: 0 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('m-1');
  });

  it('resolves two levels of category descendants when categoryId is given', async () => {
    const categoryFindMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'child-1' }])
      .mockResolvedValueOnce([{ id: 'grandchild-1' }]);
    const { service } = build({ categoryFindMany });

    await service.search({ page: 1, limit: 20, skip: 0, categoryId: 'cat-1' });

    expect(categoryFindMany).toHaveBeenCalledTimes(2);
  });

  it('does not resolve descendants when categoryId is absent', async () => {
    const categoryFindMany = jest.fn();
    const { service } = build({ categoryFindMany });

    await service.search({ page: 1, limit: 20, skip: 0 });

    expect(categoryFindMany).not.toHaveBeenCalled();
  });

  it('joins the price aggregate only when sorting by price', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, sort: MasterSort.PRICE_ASC });

    const sql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(sql).toContain('LEFT JOIN LATERAL');
  });

  it('omits the price join when sorting by rating', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, sort: MasterSort.RATING_DESC });

    const sql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(sql).not.toContain('LEFT JOIN LATERAL');
  });

  it('runs the count query with the same filters as the data query', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'm-1' }])
      .mockResolvedValueOnce([{ total: BigInt(1) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, cityId: 'city-1', minRating: 3 });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    const countSql = (queryRaw.mock.calls[1]?.[0] as { strings: string[] }).strings.join(' ');
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).toContain('city_id');
    expect(countSql).toContain('rating_average');
    expect(countSql).not.toContain('ORDER BY');
    expect(dataSql).toContain('city_id');
    expect(dataSql).toContain('ORDER BY');
  });
});
