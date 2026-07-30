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

  // SRS-AUTH-8: the full reset cycle, driven with the token captured from the outbound
  // email rather than read from the database — only its hash is ever stored.
  describe('reset cycle', () => {
    const resetToken = (): string => {
      const sent = app.mail.at(-1);
      if (sent === undefined) {
        throw new Error('No reset email was captured.');
      }
      const token = /token=([^\s&]+)/.exec(sent.text)?.[1];
      if (token === undefined) {
        throw new Error('Reset email carried no token.');
      }
      return token;
    };

    it('sets a new password, revokes every session and rejects reuse of the link', async () => {
      const actor = await createClient(app);

      await request(app.server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: actor.email })
        .expect(202);

      const token = resetToken();
      const newPassword = 'brandnewpass9';

      await request(app.server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(204);

      // The session that was live before the reset is gone.
      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: actor.refreshToken })
        .expect(401);

      // The new password works; the old one does not.
      await login(app, actor.email, newPassword);
      await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: actor.email, password: VALID_PASSWORD })
        .expect(401);

      // A second use of the same link is a used, not merely an unknown, token.
      const replay = await request(app.server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'anotherpass9' })
        .expect(400);
      expect(replay.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects an unknown token', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'brandnewpass9' })
        .expect(400);

      expect(response.body.code).toBe('INVALID_RESET_TOKEN');
    });
  });

  // Phase 6: email verification.
  describe('email verification', () => {
    const verificationToken = (): string => {
      const sent = app.mail.at(-1);
      if (sent === undefined) {
        throw new Error('No verification email was captured.');
      }
      const token = /token=([^\s&]+)/.exec(sent.text)?.[1];
      if (token === undefined) {
        throw new Error('Verification email carried no token.');
      }
      return token;
    };

    it('registration sends a verification email, and the token marks the address verified', async () => {
      const actor = await createClient(app);

      const token = verificationToken();

      await request(app.server).post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const user = await app.prisma.db.user.findUniqueOrThrow({ where: { id: actor.id } });
      expect(user.emailVerifiedAt).not.toBeNull();

      // Single use.
      const replay = await request(app.server)
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(400);
      expect(replay.body.code).toBe('INVALID_VERIFICATION_TOKEN');
    });

    it('rejects an unknown token', async () => {
      const response = await request(app.server)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'not-a-real-token' })
        .expect(400);

      expect(response.body.code).toBe('INVALID_VERIFICATION_TOKEN');
    });

    it('resend issues a fresh token and invalidates the previous one', async () => {
      const actor = await createClient(app);
      const firstToken = verificationToken();

      await request(app.server)
        .post('/api/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(202);

      const secondToken = verificationToken();
      expect(secondToken).not.toBe(firstToken);

      await request(app.server)
        .post('/api/v1/auth/verify-email')
        .send({ token: firstToken })
        .expect(400);

      await request(app.server)
        .post('/api/v1/auth/verify-email')
        .send({ token: secondToken })
        .expect(204);
    });

    it('rejects resend once the address is already verified', async () => {
      const actor = await createClient(app);
      const token = verificationToken();

      await request(app.server).post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const response = await request(app.server)
        .post('/api/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(409);

      expect(response.body.code).toBe('EMAIL_ALREADY_VERIFIED');
    });
  });

  describe('PATCH /auth/password', () => {
    it('changes the password and revokes every other session but the caller’s', async () => {
      const actor = await createClient(app);
      const other = await login(app, actor.email, VALID_PASSWORD);
      const newPassword = 'anotherpassword9';

      await request(app.server)
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ currentPassword: VALID_PASSWORD, password: newPassword })
        .expect(204);

      // The other session is revoked; the caller's is not.
      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(401);
      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: actor.refreshToken })
        .expect(200);

      await login(app, actor.email, newPassword);
    });

    it('rejects the wrong current password', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .patch('/api/v1/auth/password')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ currentPassword: 'wrongpassword1', password: 'anotherpassword9' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_CREDENTIALS');
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
