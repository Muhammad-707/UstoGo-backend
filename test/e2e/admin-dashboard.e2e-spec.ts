import request from 'supertest';

import {
  anyCityId,
  createAdmin,
  createApprovedMaster,
  createClient,
  createPendingMaster,
} from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Admin dashboard (e2e)', () => {
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

  describe('GET /admin/dashboard', () => {
    it('returns zeroed aggregates against an empty database', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        users: { clients: 0, masters: 0, admins: 1, blocked: 0 },
        masters: { pending: 0, approved: 0, rejected: 0, inactive: 0 },
        bookings: {
          pending: 0,
          accepted: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
          expired: 0,
        },
        rates: { completionRate: 0, cancellationRate: 0, acceptanceRate: 0 },
        reviews: { count: 0, averageRating: 0 },
        topCategories: [],
      });
      expect(
        (response.body.series as unknown[]).every(
          (point) =>
            typeof point === 'object' &&
            point !== null &&
            (point as { created: number }).created === 0 &&
            (point as { completed: number }).completed === 0,
        ),
      ).toBe(true);
    });

    it('counts clients, pending and approved masters', async () => {
      const admin = await createAdmin(app);
      const cityId = await anyCityId(app.prisma);
      await createClient(app);
      await createPendingMaster(app, cityId);
      await createApprovedMaster(app, cityId);

      const response = await request(app.server)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body.users).toMatchObject({ clients: 1, masters: 2, admins: 1 });
      expect(response.body.masters).toMatchObject({ pending: 1, approved: 1 });
    });

    it('rejects `to` before `from` with DATE_RANGE_TOO_LARGE', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .get('/api/v1/admin/dashboard')
        .query({ from: '2026-07-30T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(422);

      expect(response.body.code).toBe('DATE_RANGE_TOO_LARGE');
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/dashboard',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return { owner, stranger: wrongRole, wrongRole, path: '/api/v1/admin/dashboard' };
        },
      },
      () => app,
    );
  });
});
