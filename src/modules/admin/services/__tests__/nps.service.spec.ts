import type { PrismaService } from '@prisma-lib/prisma.service';

import type { DashboardQueryDto } from '../../dto/requests/dashboard-query.dto';
import { DashboardRangeInvalidException } from '../../exceptions/admin.exceptions';
import { NpsService } from '../nps.service';

const build = (
  overrides: {
    review?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      review: { findMany: jest.fn().mockResolvedValue([]), ...overrides.review },
      service: { findMany: jest.fn().mockResolvedValue([]), ...overrides.service },
      masterProfile: { findMany: jest.fn().mockResolvedValue([]), ...overrides.masterProfile },
    },
  } as unknown as PrismaService;

  return { prisma, service: new NpsService(prisma) };
};

const QUERY: DashboardQueryDto = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-30T00:00:00.000Z',
};

describe('NpsService.getNps', () => {
  it('rejects a range with `to` before `from`', async () => {
    const { service } = build();

    await expect(
      service.getNps({ from: '2026-07-30T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' }),
    ).rejects.toThrow(DashboardRangeInvalidException);
  });

  it('reports null overallNps with zero responses', async () => {
    const { service } = build();

    const result = await service.getNps(QUERY);

    expect(result.overallNps).toBeNull();
    expect(result.responseCount).toBe(0);
    expect(result.byCategory).toEqual([]);
    expect(result.byMaster).toEqual([]);
  });

  it('computes the overall NPS from every response in range', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([
          { npsScore: 10, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          { npsScore: 0, masterProfileId: 'm2', booking: { serviceId: 's2' } },
        ]),
      },
    });

    const result = await service.getNps(QUERY);

    expect(result.overallNps).toBe(0);
    expect(result.promoters).toBe(1);
    expect(result.detractors).toBe(1);
    expect(result.responseCount).toBe(2);
  });

  it('groups by category via the response’s booking→service→category chain', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([
          { npsScore: 10, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          { npsScore: 9, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          { npsScore: 0, masterProfileId: 'm2', booking: { serviceId: 's2' } },
        ]),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', category: { id: 'cat-1', name: 'Electrical' } },
          { id: 's2', category: { id: 'cat-2', name: 'Plumbing' } },
        ]),
      },
    });

    const result = await service.getNps(QUERY);

    expect(result.byCategory).toEqual([
      { categoryId: 'cat-1', categoryName: 'Electrical', nps: 100, responseCount: 2 },
      { categoryId: 'cat-2', categoryName: 'Plumbing', nps: -100, responseCount: 1 },
    ]);
  });

  it('groups by master, most responses first, capped at 10', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([
          { npsScore: 10, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          { npsScore: 9, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          { npsScore: 8, masterProfileId: 'm2', booking: { serviceId: 's1' } },
        ]),
      },
      masterProfile: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', displayName: 'Alice' },
          { id: 'm2', displayName: 'Bob' },
        ]),
      },
    });

    const result = await service.getNps(QUERY);

    expect(result.byMaster).toEqual([
      { masterId: 'm1', displayName: 'Alice', nps: 100, responseCount: 2 },
      { masterId: 'm2', displayName: 'Bob', nps: 0, responseCount: 1 },
    ]);
  });

  it('skips a response whose service can no longer be resolved (soft-deleted)', async () => {
    const { service } = build({
      review: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { npsScore: 10, masterProfileId: 'm1', booking: { serviceId: 's1' } },
          ]),
      },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.getNps(QUERY);

    expect(result.byCategory).toEqual([]);
  });
});
