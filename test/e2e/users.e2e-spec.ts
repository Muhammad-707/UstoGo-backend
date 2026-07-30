import request from 'supertest';

import { VALID_PASSWORD } from '../fixtures/user.fixture';
import {
  anyCityId,
  createAdmin,
  createApprovedMaster,
  createClient,
  login,
  type Actor,
} from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Users (e2e)', () => {
  let app: TestApp;
  let cityId: string;

  beforeAll(async () => {
    app = await createTestApp();
    cityId = await anyCityId(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.prisma);
  });

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /users/me',
      context: async (current) => {
        const owner = await createClient(current);
        const stranger = await createClient(current);

        return { owner, stranger, path: '/api/v1/users/me' };
      },
    },
    () => app,
  );

  describe('GET /users/me', () => {
    it('returns the account with the profile the role implies', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: actor.id, role: 'CLIENT' });
      expect(response.body.clientProfile).toMatchObject({ firstName: 'Aziz' });
      expect(response.body.masterProfile).toBeNull();
    });

    it('serves an administrator, which has no role profile at all', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ role: 'ADMIN' });
      expect(response.body.clientProfile).toBeNull();
      expect(response.body.masterProfile).toBeNull();
    });

    // The projection never names passwordHash, so no mapper can leak it.
    it('never exposes the password hash', async () => {
      const master = await createApprovedMaster(app, cityId);

      const response = await request(app.server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${master.accessToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });
  });

  describe('GET /users/me/export', () => {
    it('returns the caller’s own account, bookings, reviews and notifications', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .get('/api/v1/users/me/export')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      expect(response.body.account).toMatchObject({ id: actor.id });
      expect(Array.isArray(response.body.bookings)).toBe(true);
      expect(Array.isArray(response.body.reviews)).toBe(true);
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body.exportedAt).toEqual(expect.any(String));
    });

    it('requires authentication', async () => {
      await request(app.server).get('/api/v1/users/me/export').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('applies a partial update and leaves the rest alone', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ firstName: 'Bekzod' })
        .expect(200);

      expect(response.body.clientProfile).toMatchObject({
        firstName: 'Bekzod',
        lastName: 'Karimov',
      });
    });

    // Silent stripping is what forbidNonWhitelisted exists to prevent; it should not
    // reappear one layer down.
    it('rejects a field belonging to the other role, naming it', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ displayName: 'Not a client field' })
        .expect(422);

      expect(JSON.stringify(response.body)).toContain('displayName');
    });

    it('cannot be used to change the email or the role', async () => {
      const actor = await createClient(app);

      await request(app.server)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ email: 'new@example.test' })
        .expect(422);

      await request(app.server)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ role: 'ADMIN' })
        .expect(422);
    });

    it('refuses an unknown city', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ cityId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);

      expect(response.body.code).toBe('CITY_NOT_FOUND');
    });
  });

  describe('DELETE /users/me', () => {
    let actor: Actor;

    beforeEach(async () => {
      actor = await createClient(app);
    });

    it('soft-deletes the account and revokes every session', async () => {
      await request(app.server)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(204);

      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: actor.refreshToken })
        .expect(401);

      // Soft, not hard: history keeps its author.
      const row = await app.prisma.user.findUnique({ where: { id: actor.id } });
      expect(row?.deletedAt).not.toBeNull();
    });

    it('anonymises email, phone and the client profile name', async () => {
      await request(app.server)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(204);

      const row = await app.prisma.user.findUnique({
        where: { id: actor.id },
        include: { clientProfile: true },
      });

      expect(row?.email).toBe(`deleted-${actor.id}@deleted.invalid`);
      expect(row?.phone).toBeNull();
      expect(row?.clientProfile?.firstName).toBe('Deleted');
      expect(row?.clientProfile?.lastName).toBe('User');
    });

    it('frees the email and phone for a fresh registration', async () => {
      await request(app.server)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(204);

      await createClient(app, { email: actor.email });
    });

    it('a deleted account cannot log in', async () => {
      await request(app.server)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(204);

      await request(app.server)
        .post('/api/v1/auth/login')
        .send({ email: actor.email, password: VALID_PASSWORD })
        .expect(401);
    });

    // JwtStrategy re-reads the account, so access ends at once rather than at expiry.
    it('an access token issued before deletion stops working immediately', async () => {
      const token = actor.accessToken;

      await request(app.server)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.server)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('GET /cities', () => {
    it('is public and returns the seeded reference list', async () => {
      const response = await request(app.server).get('/api/v1/cities').expect(200);

      const items = response.body.items ?? response.body;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('login as each role', () => {
    it('issues a token carrying the right role for every role', async () => {
      const client = await createClient(app);
      const master = await createApprovedMaster(app, cityId);
      const admin = await createAdmin(app);

      for (const actor of [client, master, admin]) {
        const session = await login(app, actor.email, VALID_PASSWORD);
        expect(session.role).toBe(actor.role);
      }
    });
  });
});
