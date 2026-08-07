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

describe('Favorites (e2e)', () => {
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

  const masterProfileIdFor = async (userId: string): Promise<string> => {
    const profile = await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId } });
    return profile.id;
  };

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /favorites',
      allowedRoles: ['CLIENT'],
      context: async (current) => {
        const owner = await createClient(current);
        const stranger = await createClient(current);
        const wrongRole = await createAdmin(current);

        return { owner, stranger, wrongRole, path: '/api/v1/favorites' };
      },
    },
    () => app,
  );

  it('starts empty for a new client', async () => {
    const client = await createClient(app);

    const response = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('saves and lists a master, without over-exposing fields', async () => {
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const master = await createApprovedMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);

    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    const response = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({ id: masterProfileId })]);
    expect(response.body[0]).not.toHaveProperty('user');
    expect(response.body[0]).not.toHaveProperty('email');
  });

  it('is idempotent — favoriting the same master twice adds one row', async () => {
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const master = await createApprovedMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);

    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);
    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    const response = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
  });

  it('lists newest-favorited first', async () => {
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const first = await createApprovedMaster(app, cityId);
    const second = await createApprovedMaster(app, cityId);
    const firstId = await masterProfileIdFor(first.id);
    const secondId = await masterProfileIdFor(second.id);

    await request(app.server)
      .post(`/api/v1/favorites/${firstId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);
    await request(app.server)
      .post(`/api/v1/favorites/${secondId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    const response = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body.map((m: { id: string }) => m.id)).toEqual([secondId, firstId]);
  });

  it('404 MASTER_NOT_FOUND for a pending (not yet approved) master', async () => {
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const pending = await createPendingMaster(app, cityId);
    const pendingId = await masterProfileIdFor(pending.id);

    const response = await request(app.server)
      .post(`/api/v1/favorites/${pendingId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(404);

    expect(response.body.code).toBe('MASTER_NOT_FOUND');
  });

  it('404 MASTER_NOT_FOUND for an id that does not exist', async () => {
    const client = await createClient(app);

    await request(app.server)
      .post('/api/v1/favorites/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(404);
  });

  it('removes a favorite, idempotently, without affecting another client', async () => {
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const otherClient = await createClient(app);
    const master = await createApprovedMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);

    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);
    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${otherClient.accessToken}`)
      .expect(204);

    await request(app.server)
      .delete(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);
    // Idempotent — removing an already-removed favorite is still 204.
    await request(app.server)
      .delete(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    const clientList = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const otherList = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${otherClient.accessToken}`)
      .expect(200);

    expect(clientList.body).toEqual([]);
    expect(otherList.body).toEqual([expect.objectContaining({ id: masterProfileId })]);
  });

  it('keeps a favorite listed after the master later goes inactive', async () => {
    // FavoritesService.list is unfiltered by design — it is a saved-for-later list, not
    // a live search result, so a master's later deactivation does not silently drop it.
    const cityId = await anyCityId(app.prisma);
    const client = await createClient(app);
    const master = await createApprovedMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);

    await request(app.server)
      .post(`/api/v1/favorites/${masterProfileId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    await app.prisma.db.masterProfile.update({
      where: { id: masterProfileId },
      data: { isActive: false },
    });

    const response = await request(app.server)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({ id: masterProfileId })]);
  });
});
