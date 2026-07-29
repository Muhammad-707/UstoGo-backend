import { AuditAction } from '@prisma/client';
import request from 'supertest';

import { createAdmin, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/**
 * No admin mutation route exists yet to drive `AuditInterceptor` end to end — it lands
 * with F-05 Categories, its first real consumer. This suite exercises the read side
 * (`GET /admin/audit-logs`) against rows seeded directly, the way the interceptor will
 * write them.
 */
describe('Audit (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.prisma);
  });

  const seed = async (actorUserId: string, overrides: Partial<Record<string, unknown>> = {}) =>
    app.prisma.db.auditLog.create({
      data: {
        actorUserId,
        action: AuditAction.CATEGORY_CREATED,
        entityType: 'Category',
        entityId: '00000000-0000-4000-8000-000000000001',
        ...overrides,
      },
    });

  describe('GET /admin/audit-logs', () => {
    it('lists entries newest first', async () => {
      const admin = await createAdmin(app);
      const older = await seed(admin.id);
      const newer = await seed(admin.id, { action: AuditAction.CATEGORY_UPDATED });

      const response = await request(app.server)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    });

    it('filters by action, entityType and entityId', async () => {
      const admin = await createAdmin(app);
      const target = await seed(admin.id, { entityId: '00000000-0000-4000-8000-0000000000aa' });
      await seed(admin.id, { entityId: '00000000-0000-4000-8000-0000000000bb' });

      const response = await request(app.server)
        .get('/api/v1/admin/audit-logs')
        .query({ entityId: '00000000-0000-4000-8000-0000000000aa' })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(target.id);
    });

    it('filters by a createdAt range', async () => {
      const admin = await createAdmin(app);
      await seed(admin.id);

      const future = await request(app.server)
        .get('/api/v1/admin/audit-logs')
        .query({ from: '2999-01-01T00:00:00.000Z' })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(future.body.items).toHaveLength(0);
    });

    it('exposes the paginated envelope', async () => {
      const admin = await createAdmin(app);
      await seed(admin.id);

      const response = await request(app.server)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/audit-logs',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          await seed(owner.id);

          return { owner, stranger: wrongRole, wrongRole, path: '/api/v1/admin/audit-logs' };
        },
      },
      () => app,
    );
  });
});
