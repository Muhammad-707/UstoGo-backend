import { AuditAction } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import type { AuditLogQueryDto } from '../../dto/requests/audit-log-query.dto';
import { AuditService } from '../audit.service';

const build = (create: jest.Mock = jest.fn().mockResolvedValue({})) => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    db: { auditLog: { create, findMany, count } },
  } as unknown as PrismaService;

  return { service: new AuditService(prisma), create, findMany, count };
};

const ENTRY = {
  actorUserId: 'admin-1',
  action: AuditAction.CATEGORY_CREATED,
  entityType: 'Category',
  entityId: 'cat-1',
};

describe('AuditService.record', () => {
  it('writes actor, action, entity and the optional fields when supplied', async () => {
    const { service, create } = build();

    await service.record({
      ...ENTRY,
      before: { name: 'old' },
      after: { name: 'new' },
      reason: 'renamed',
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-1',
        action: AuditAction.CATEGORY_CREATED,
        entityType: 'Category',
        entityId: 'cat-1',
        before: { name: 'old' },
        after: { name: 'new' },
        reason: 'renamed',
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      },
    });
  });

  it('omits optional fields entirely rather than writing them as undefined', async () => {
    const { service, create } = build();

    await service.record(ENTRY);

    const data = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

    expect(data).not.toHaveProperty('before');
    expect(data).not.toHaveProperty('after');
    expect(data).not.toHaveProperty('reason');
    expect(data).not.toHaveProperty('ipAddress');
    expect(data).not.toHaveProperty('userAgent');
  });

  // Accountability must not become availability: a failed write here must not fail
  // the mutation that already committed and already responded.
  it('swallows a write failure rather than throwing', async () => {
    const { service } = build(jest.fn().mockRejectedValue(new Error('db down')));

    await expect(service.record(ENTRY)).resolves.toBeUndefined();
  });
});

describe('AuditService.list', () => {
  const query = (overrides: Partial<AuditLogQueryDto> = {}): AuditLogQueryDto => ({
    page: 1,
    limit: 20,
    skip: 0,
    ...overrides,
  });

  it('builds no filters from an empty query', async () => {
    const { service, findMany, count } = build();

    await service.list(query());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { createdAt: 'desc' }, skip: 0, take: 20 }),
    );
    expect(count).toHaveBeenCalledWith({ where: {} });
  });

  it('filters by actor, action, entity and a createdAt range', async () => {
    const { service, findMany } = build();

    await service.list(
      query({
        actorUserId: 'admin-1',
        action: AuditAction.CATEGORY_CREATED,
        entityType: 'Category',
        entityId: 'cat-1',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      }),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorUserId: 'admin-1',
          action: AuditAction.CATEGORY_CREATED,
          entityType: 'Category',
          entityId: 'cat-1',
          createdAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('applies an open-ended lower bound when only from is given', async () => {
    const { service, findMany } = build();

    await service.list(query({ from: '2026-01-01T00:00:00.000Z' }));

    const call = findMany.mock.calls[0] as [{ where: { createdAt?: Record<string, Date> } }];
    expect(call[0].where.createdAt).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z') });
  });

  it('applies an open-ended upper bound when only to is given', async () => {
    const { service, findMany } = build();

    await service.list(query({ to: '2026-01-31T00:00:00.000Z' }));

    const call = findMany.mock.calls[0] as [{ where: { createdAt?: Record<string, Date> } }];
    expect(call[0].where.createdAt).toEqual({ lte: new Date('2026-01-31T00:00:00.000Z') });
  });

  it('returns the total alongside the page of items', async () => {
    const { service, count } = build();
    count.mockResolvedValue(42);

    await expect(service.list(query())).resolves.toMatchObject({ total: 42 });
  });
});
