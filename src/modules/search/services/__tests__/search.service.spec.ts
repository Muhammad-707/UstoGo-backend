import { MasterSort } from '@modules/masters/dto/requests/master-search-query.dto';
import { MastersSearchService } from '@modules/masters/services/masters-search.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { SearchService } from '../search.service';

const ROW = {
  id: 'm-1',
  displayName: 'Jamshed',
  avatarFileId: null,
  bannerFileId: null,
  avatarUrl: null,
  yearsOfExperience: 3,
  serviceRadiusKm: 15,
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

  const masters = {
    mintAvatarUrls: jest.fn().mockImplementation((items) => Promise.resolve(items)),
    mintBannerUrls: jest.fn().mockImplementation((items) => Promise.resolve(items)),
  } as unknown as MastersSearchService;

  return { service: new SearchService(prisma, masters), prisma, queryRaw };
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

  it('constrains by min and max price when either is given', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, minPrice: 10, maxPrice: 100 });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('s.price >= ');
    expect(dataSql).toContain('s.price <= ');
  });

  it('constrains only by min price when max is absent', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, minPrice: 10 });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('s.price >= ');
    expect(dataSql).not.toContain('s.price <=');
  });

  it('filters to masters available on a given date', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, availableOn: '2026-08-05' });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('schedule_exceptions');
    expect(dataSql).toContain('working_days');
  });

  it('filters by certificate presence when requested', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, hasCertificates: true });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('certificates');
  });

  it('applies the full-text search condition when a term is given', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, search: 'plumber' });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('search_vector');
    expect(dataSql).toContain('plainto_tsquery');
  });

  it('constrains only by max price when min is absent', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, maxPrice: 500 });

    const dataSql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(dataSql).toContain('s.price <= ');
    expect(dataSql).not.toContain('s.price >= ');
  });

  it('reports no count row as a total of zero', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { service } = build({ queryRaw });

    const result = await service.search({ page: 1, limit: 20, skip: 0 });

    expect(result.total).toBe(0);
  });

  it('stops at the level-one descendants when a category has no children', async () => {
    const categoryFindMany = jest.fn().mockResolvedValueOnce([]);
    const { service } = build({ categoryFindMany });

    await service.search({ page: 1, limit: 20, skip: 0, categoryId: 'leaf-1' });

    expect(categoryFindMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    [MasterSort.CREATED_DESC, 'created_at DESC'],
    [MasterSort.PRICE_DESC, 'min_price DESC'],
    [MasterSort.RATING_DESC, 'rating_average DESC'],
  ])('orders by %s', async (sort, fragment) => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: BigInt(0) }]);
    const { service } = build({ queryRaw });

    await service.search({ page: 1, limit: 20, skip: 0, sort });

    const sql = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join(' ');
    expect(sql).toContain(fragment);
  });
});
