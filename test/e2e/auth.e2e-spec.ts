import request from 'supertest';

import { clientRegistration, uniqueEmail, VALID_PASSWORD } from '../fixtures/user.fixture';
import { createClient, login } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Auth (e2e)', () => {
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

  describe('POST /auth/register/client', () => {
    it('creates the account and returns a usable token pair', async () => {
      const payload = clientRegistration();

      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send(payload)
        .expect(201);

      expect(response.body).toMatchObject({
        user: { email: payload.email, role: 'CLIENT', status: 'ACTIVE' },
      });
      expect(response.body.accessToken).toEqual(expect.any(String));

      await request(app.server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('never returns the password hash', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send(clientRegistration())
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    // SRS-AUTH-2 / FR-1.3: admin registration is structurally impossible.
    it('rejects a role field rather than ignoring it', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send({ ...clientRegistration(), role: 'ADMIN' })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(response.body.details)).toContain('role');
    });

    it('refuses a duplicate email and writes no partial rows', async () => {
      const payload = clientRegistration();

      await request(app.server).post('/api/v1/auth/register/client').send(payload).expect(201);

      const conflict = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send({ ...payload, phone: undefined })
        .expect(409);

      expect(conflict.body.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(await app.prisma.db.user.count({ where: { email: payload.email } })).toBe(1);
    });

    // SRS-X-1: the documented envelope, with a details array.
    it('returns the documented error envelope on a validation failure', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send({ ...clientRegistration(), password: 'short' })
        .expect(422);

      expect(response.body).toMatchObject({
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        path: '/api/v1/auth/register/client',
      });
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
      expect(response.body.timestamp).toEqual(expect.any(String));
    });

    // The rejected value must not travel back in the error, or into any log recording it.
    it('does not echo the rejected password', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/register/client')
        .send({ ...clientRegistration(), password: 'short' })
        .expect(422);

      expect(JSON.stringify(response.body)).not.toContain('short');
    });
  });

  describe('POST /auth/login', () => {
    // SRS-AUTH-9: no user enumeration.
    it('answers identically for an unknown email and a wrong password', async () => {
      const actor = await createClient(app);

      const unknown = await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: VALID_PASSWORD })
        .expect(401);

      const wrongPassword = await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: actor.email, password: 'wrongpassword1' })
        .expect(401);

      expect(unknown.body.code).toBe(wrongPassword.body.code);
      expect(unknown.body.message).toBe(wrongPassword.body.message);
      expect(unknown.body.statusCode).toBe(wrongPassword.body.statusCode);
    });

    it('issues a working token pair for correct credentials', async () => {
      const actor = await createClient(app);
      const session = await login(app, actor.email, VALID_PASSWORD);

      expect(session.id).toBe(actor.id);
      expect(session.refreshToken).toEqual(expect.any(String));
    });
  });

  // SRS-AUTH-5: rotation, family tracking and reuse detection, as a journey.
  describe('session journey', () => {
    it('rotates, then revokes the family when an old token is replayed', async () => {
      const actor = await createClient(app);

      const first = await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: actor.refreshToken })
        .expect(200);

      const second = await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(200);

      // Replaying the consumed token is the theft signal.
      const replay = await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);

      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

      // The whole family goes, including the successor the attacker never saw.
      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(401);

      const live = await app.prisma.db.refreshToken.count({
        where: { userId: actor.id, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('logout revokes only the presented token', async () => {
      const actor = await createClient(app);
      const other = await login(app, actor.email, VALID_PASSWORD);

      await request(app.server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ refreshToken: actor.refreshToken })
        .expect(204);

      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: actor.refreshToken })
        .expect(401);

      // The other session is untouched.
      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(200);
    });

    it('logout-all revokes every session', async () => {
      const actor = await createClient(app);
      const other = await login(app, actor.email, VALID_PASSWORD);

      await request(app.server)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(204);

      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(401);
    });
  });

  describe('POST /auth/forgot-password', () => {
    // Always 202, or the response becomes the enumeration oracle login is not.
    it('answers 202 whether or not the address exists', async () => {
      const actor = await createClient(app);

      await request(app.server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: actor.email })
        .expect(202);

      await request(app.server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail('ghost') })
        .expect(202);
    });
  });

  describe('unknown routes', () => {
    it('returns the error envelope rather than a framework default', async () => {
      const response = await request(app.server).get('/api/v1/does-not-exist').expect(404);

      expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
  });

  describe('correlation', () => {
    it('echoes a request id on every response', async () => {
      const response = await request(app.server).get('/api/v1/cities').expect(200);

      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    });
  });
});
