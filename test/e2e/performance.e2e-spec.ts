import request from 'supertest';

import { anyCityId, createApprovedMaster } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/**
 * ROADMAP.md Phase 3 exit: "index verification, query-count assertions, k6 baseline".
 * The k6 load script (`k6/search.js`) covers the actual p95 measurement against a
 * running stack — that needs a real HTTP server under load, not a Jest process. What
 * belongs here is what a unit/e2e run can prove cheaply: the indexes the plan relies on
 * exist, and the hot-path query for a list endpoint is O(1) queries, not O(n).
 */
describe('Performance baseline (e2e)', () => {
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

  it('has the indexes DATABASE.md §3.3/§6 promise for search and scheduling', async () => {
    const rows = await app.prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('master_profiles', 'working_days', 'schedule_exceptions')
    `;
    const names = rows.map((row) => row.indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        'master_profiles_search_vector_idx',
        'master_profiles_approval_status_is_active_idx',
        'master_profiles_city_id_idx',
        'master_profiles_rating_average_idx',
        'working_days_master_profile_id_weekday_idx',
        'schedule_exceptions_master_profile_id_date_key',
      ]),
    );
  });

  const countQueriesFor = async (masterCount: number): Promise<number> => {
    const cityId = await anyCityId(app.prisma);
    for (let i = 0; i < masterCount; i += 1) {
      await createApprovedMaster(app, cityId);
    }

    let queryCount = 0;
    app.prisma.$on('query', () => {
      queryCount += 1;
    });

    await request(app.server).get('/api/v1/masters').expect(200);

    return queryCount;
  };

  it('runs GET /masters in a query count that does not grow with the result count', async () => {
    // Candidate-id raw query + one hydration query per included relation (city,
    // categories, services, certificates) — fixed regardless of how many rows match,
    // which is what rules out an N+1 here rather than any specific number of queries.
    const withThree = await countQueriesFor(3);
    const withSix = await countQueriesFor(6);

    expect(withSix).toBe(withThree);
  });
});
