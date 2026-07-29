import request from 'supertest';

import { clientRegistration, uniqueEmail, VALID_PASSWORD } from '../fixtures/user.fixture';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/**
 * The one suite that keeps the real `ThrottlerGuard` (`API.md` §13).
 *
 * Everywhere else it is disabled, because the limits are per-IP and every test arrives
 * from the same address — a suite that kept them would assert the rate limiter instead
 * of the behaviour each test is about. Here it is the subject.
 */
describe('Rate limiting (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp({ throttling: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.prisma);
  });

  it('stops registration after the documented 5 attempts and says how long to wait', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send(clientRegistration());

      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);

    const blocked = await request(app.server)
      .post('/api/v1/auth/register/client')
      .send(clientRegistration())
      .expect(429);

    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    // Without it a client can only guess, and guessing means retrying immediately.
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  // Each limiter counts its own bucket. Sharing one would mean a burst of failed logins
  // could lock out password resets, which is a denial of service, not a rate limit.
  it('keeps the login and registration buckets separate', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await request(app.server).post('/api/v1/auth/register/client').send(clientRegistration());
    }

    const login = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: VALID_PASSWORD });

    expect(login.status).not.toBe(429);
  });
});
