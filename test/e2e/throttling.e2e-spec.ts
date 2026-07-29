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

  // AUTHENTICATION.md §9: login is keyed on IP+email, not IP alone. Every request in
  // this suite arrives from the same address, so this is the one place that
  // distinction is observable — a pure-IP limiter would block the second address too.
  it('keys login by IP+email — five failures against one address do not touch another', async () => {
    const locked = uniqueEmail('locked');
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: locked, password: 'wrongpassword1' });

      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: locked, password: 'wrongpassword1' })
      .expect(429);

    const otherAddress = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('unrelated'), password: 'wrongpassword1' });

    expect(otherAddress.status).not.toBe(429);
  });

  // AUTHENTICATION.md §9: forgot-password is keyed on email. Two addresses must not
  // share a bucket, or resetting one account could exhaust the budget for another.
  it('keys forgot-password by email — three requests for one address do not touch another', async () => {
    const exhausted = uniqueEmail('exhausted');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: exhausted })
        .expect(202);
    }

    await request(app.server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: exhausted })
      .expect(429);

    await request(app.server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: uniqueEmail('unrelated') })
      .expect(202);
  });
});
