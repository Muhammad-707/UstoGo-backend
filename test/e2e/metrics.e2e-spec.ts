import request from 'supertest';

import { createAdmin, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Metrics (e2e)', () => {
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

  describe('GET /metrics', () => {
    it('exposes Prometheus text format, including the calling request itself', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /metrics',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return { owner, stranger: wrongRole, wrongRole, path: '/api/v1/metrics' };
        },
      },
      () => app,
    );
  });
});
