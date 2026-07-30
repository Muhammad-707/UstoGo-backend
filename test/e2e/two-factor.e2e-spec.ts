import request from 'supertest';

import { totp } from '@modules/auth/domain/totp.util';

import { VALID_PASSWORD } from '../fixtures/user.fixture';
import { bearer, createAdmin, createClient } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Two-factor authentication (e2e)', () => {
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

  const enableFor = async (accessToken: string): Promise<string> => {
    const setup = await request(app.server)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const secret = setup.body.secret as string;

    await request(app.server)
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: totp(secret) })
      .expect(204);

    return secret;
  };

  describe('POST /auth/2fa/setup, /enable', () => {
    it('is ADMIN-only', async () => {
      const client = await createClient(app);

      await request(app.server)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', bearer(client))
        .expect(403);
    });

    it('enables 2FA for a valid code and rejects a wrong one', async () => {
      const admin = await createAdmin(app);

      const setup = await request(app.server)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(setup.body.secret).toEqual(expect.any(String));
      expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

      await request(app.server)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', bearer(admin))
        .send({ code: '000000' })
        .expect(401);

      await request(app.server)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', bearer(admin))
        .send({ code: totp(setup.body.secret as string) })
        .expect(204);
    });

    it('rejects setup for an account already enrolled', async () => {
      const admin = await createAdmin(app);
      await enableFor(admin.accessToken);

      await request(app.server)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', bearer(admin))
        .expect(409);
    });
  });

  describe('login journey with 2FA enabled', () => {
    it('login returns a challenge, and only the correct code + challenge exchanges it for tokens', async () => {
      const admin = await createAdmin(app);
      const secret = await enableFor(admin.accessToken);

      const loginResponse = await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: VALID_PASSWORD })
        .expect(200);

      expect(loginResponse.body).toEqual({
        twoFactorRequired: true,
        challengeToken: expect.any(String) as string,
      });
      expect(loginResponse.body.accessToken).toBeUndefined();

      const challengeToken = loginResponse.body.challengeToken as string;

      await request(app.server)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: '000000' })
        .expect(401);

      const verified = await request(app.server)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: totp(secret) })
        .expect(200);

      expect(verified.body.accessToken).toEqual(expect.any(String));

      // Single use: replaying the challenge fails even with a fresh, otherwise-valid code.
      await request(app.server)
        .post('/api/v1/auth/2fa/verify')
        .send({ challengeToken, code: totp(secret) })
        .expect(401);
    });
  });

  describe('POST /auth/2fa/disable', () => {
    it('requires a valid code and turns 2FA off', async () => {
      const admin = await createAdmin(app);
      const secret = await enableFor(admin.accessToken);

      await request(app.server)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', bearer(admin))
        .send({ code: '000000' })
        .expect(401);

      await request(app.server)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', bearer(admin))
        .send({ code: totp(secret) })
        .expect(204);

      // Login now succeeds directly again, no challenge.
      const loginResponse = await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: VALID_PASSWORD })
        .expect(200);

      expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects disabling an account without 2FA', async () => {
      const admin = await createAdmin(app);

      await request(app.server)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', bearer(admin))
        .send({ code: '123456' })
        .expect(409);
    });
  });
});
