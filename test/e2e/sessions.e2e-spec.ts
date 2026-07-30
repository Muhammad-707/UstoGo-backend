import request from 'supertest';

import { VALID_PASSWORD } from '../fixtures/user.fixture';
import { bearer, createClient, type Actor } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Sessions (e2e)', () => {
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

  /** Logs the same account in again, so it holds a second, distinct session family. */
  const secondDevice = async (owner: Actor, deviceId: string): Promise<Actor> => {
    const response = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: VALID_PASSWORD, deviceId })
      .expect(200);

    return {
      id: owner.id,
      email: owner.email,
      role: owner.role,
      accessToken: (response.body as { accessToken: string }).accessToken,
      refreshToken: (response.body as { refreshToken: string }).refreshToken,
    };
  };

  describe('GET /auth/sessions', () => {
    it('lists one row per device, most recently active first, marking the caller current', async () => {
      const owner = await createClient(app);
      const other = await secondDevice(owner, 'laptop-1');

      const listedFromOther = await request(app.server)
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(other))
        .expect(200);

      const sessions = listedFromOther.body as {
        id: string;
        deviceId: string | null;
        current: boolean;
      }[];

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.current).toBe(true);
      expect(sessions.filter((s) => s.current)).toHaveLength(1);
      expect(sessions.some((s) => s.deviceId === 'laptop-1')).toBe(true);
    });
  });

  describe('DELETE /auth/sessions/:id', () => {
    it('revokes the named device and its refresh token stops working', async () => {
      const owner = await createClient(app);
      const otherDevice = await secondDevice(owner, 'laptop-1');

      const sessions = await request(app.server)
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(owner))
        .expect(200);

      const otherSessionId = (sessions.body as { id: string; deviceId: string | null }[]).find(
        (s) => s.deviceId === 'laptop-1',
      )?.id;

      await request(app.server)
        .delete(`/api/v1/auth/sessions/${String(otherSessionId)}`)
        .set('Authorization', bearer(owner))
        .expect(204);

      await request(app.server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: otherDevice.refreshToken })
        .expect(401);
    });

    it('is idempotent-unfriendly by design: revoking twice returns 404 the second time', async () => {
      const owner = await createClient(app);
      await secondDevice(owner, 'laptop-1');

      const sessions = await request(app.server)
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(owner))
        .expect(200);

      const otherSessionId = (sessions.body as { id: string; deviceId: string | null }[]).find(
        (s) => s.deviceId === 'laptop-1',
      )?.id;

      await request(app.server)
        .delete(`/api/v1/auth/sessions/${String(otherSessionId)}`)
        .set('Authorization', bearer(owner))
        .expect(204);

      await request(app.server)
        .delete(`/api/v1/auth/sessions/${String(otherSessionId)}`)
        .set('Authorization', bearer(owner))
        .expect(404);
    });
  });

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /auth/sessions',
      forbiddenFields: ['userId', 'tokenHash'],
      context: async () => {
        const owner = await createClient(app);
        const stranger = await createClient(app);
        return { owner, stranger, path: '/api/v1/auth/sessions' };
      },
    },
    () => app,
  );

  describeAuthzMatrix(
    {
      method: 'delete',
      describe: 'DELETE /auth/sessions/:id',
      expectedOwnerStatus: 204,
      context: async () => {
        const owner = await createClient(app);
        const stranger = await createClient(app);

        const sessions = await request(app.server)
          .get('/api/v1/auth/sessions')
          .set('Authorization', bearer(owner))
          .expect(200);
        const ownSessionId = (sessions.body as { id: string }[])[0]?.id;
        const ownPath = `/api/v1/auth/sessions/${String(ownSessionId)}`;

        // Same path as `path` — this is what proves a stranger's token against the
        // owner's own session id gets 404, not 403 (AUTHORIZATION.md §1).
        return { owner, stranger, path: ownPath, foreignPath: ownPath };
      },
    },
    () => app,
  );
});
