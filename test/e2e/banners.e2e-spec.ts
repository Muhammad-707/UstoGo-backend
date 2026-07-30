import { AuditAction } from '@prisma/client';
import request from 'supertest';

import { createAdmin, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/** A confirmed File the given user owns, ready to attach as a banner image. */
const seedConfirmedImage = async (
  prisma: TestApp['prisma'],
  uploadedByUserId: string,
  id?: string,
) =>
  prisma.db.file.create({
    data: {
      ...(id !== undefined ? { id } : {}),
      key: `banners/${uploadedByUserId}/${crypto.randomUUID()}.jpg`,
      bucket: 'ustogo-test',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      purpose: 'BANNER',
      uploadedByUserId,
      isConfirmed: true,
    },
  });

/**
 * `AuditInterceptor` writes the row after the response has already been sent (a
 * fire-and-forget `tap`, by design — the caller must not wait on a side effect of
 * their own request). A test asserting on that row immediately after the response
 * is therefore racing it; this polls briefly instead of asserting on the first read.
 */
const auditLogsFor = async (
  prisma: TestApp['prisma'],
  entityId: string,
): Promise<{ action: string; actorUserId: string }[]> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const logs = await prisma.db.auditLog.findMany({ where: { entityId } });
    if (logs.length > 0) {
      return logs;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return [];
};

const seedBannerFixture = async (prisma: TestApp['prisma'], adminUserId: string) => {
  const image = await seedConfirmedImage(prisma, adminUserId);

  return prisma.db.banner.create({
    data: {
      title: 'Sale',
      imageFileId: image.id,
      position: 'HOME_TOP',
      createdByUserId: adminUserId,
    },
  });
};

describe('Banners (e2e)', () => {
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

  const confirmedImage = async (uploadedByUserId: string, id?: string) =>
    seedConfirmedImage(app.prisma, uploadedByUserId, id);

  const seedBanner = async (
    adminUserId: string,
    imageFileId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) =>
    app.prisma.db.banner.create({
      data: {
        title: 'Sale',
        imageFileId,
        position: 'HOME_TOP',
        createdByUserId: adminUserId,
        ...overrides,
      },
    });

  describe('GET /banners', () => {
    it('returns only currently active banners for the requested position', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);
      const now = Date.now();

      const active = await seedBanner(admin.id, image.id, { title: 'Active', sortOrder: 1 });
      await seedBanner(admin.id, image.id, {
        title: 'Inactive flag',
        isActive: false,
        sortOrder: 2,
      });
      await seedBanner(admin.id, image.id, {
        title: 'Not started yet',
        startsAt: new Date(now + 86_400_000),
        sortOrder: 3,
      });
      await seedBanner(admin.id, image.id, {
        title: 'Expired',
        endsAt: new Date(now - 86_400_000),
        sortOrder: 4,
      });
      await seedBanner(admin.id, image.id, {
        title: 'Other position',
        position: 'HOME_MIDDLE',
        sortOrder: 5,
      });

      const response = await request(app.server)
        .get('/api/v1/banners')
        .query({ position: 'HOME_TOP' })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(active.id);
    });

    it('returns banners currently inside an open-ended window', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);
      const now = Date.now();

      await seedBanner(admin.id, image.id, { startsAt: new Date(now - 86_400_000) });
      await seedBanner(admin.id, image.id, { endsAt: new Date(now + 86_400_000) });

      const response = await request(app.server).get('/api/v1/banners').expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('orders by sortOrder', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);

      const second = await seedBanner(admin.id, image.id, { title: 'B', sortOrder: 2 });
      const first = await seedBanner(admin.id, image.id, { title: 'A', sortOrder: 1 });

      const response = await request(app.server).get('/api/v1/banners').expect(200);

      expect(response.body.map((b: { id: string }) => b.id)).toEqual([first.id, second.id]);
    });
  });

  describe('POST /admin/banners', () => {
    it('creates a banner from a confirmed image and writes an audit row', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);

      const response = await request(app.server)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Sale', imageKey: image.id, position: 'HOME_TOP' })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Sale',
        imageFileId: image.id,
        position: 'HOME_TOP',
        isActive: true,
      });

      const logs = await auditLogsFor(app.prisma, response.body.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.action).toBe(AuditAction.BANNER_CREATED);
      expect(logs[0]?.actorUserId).toBe(admin.id);
    });

    it('rejects an image the admin does not own', async () => {
      const admin = await createAdmin(app);
      const otherAdmin = await createAdmin(app);
      const image = await confirmedImage(otherAdmin.id);

      const response = await request(app.server)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Sale', imageKey: image.id, position: 'HOME_TOP' })
        .expect(404);

      expect(response.body.code).toBe('FILE_NOT_FOUND');
    });

    it('rejects an unconfirmed image', async () => {
      const admin = await createAdmin(app);
      const image = await app.prisma.db.file.create({
        data: {
          key: `banners/${admin.id}/${crypto.randomUUID()}.jpg`,
          bucket: 'ustogo-test',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          purpose: 'BANNER',
          uploadedByUserId: admin.id,
          isConfirmed: false,
        },
      });

      const response = await request(app.server)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Sale', imageKey: image.id, position: 'HOME_TOP' })
        .expect(409);

      expect(response.body.code).toBe('FILE_NOT_CONFIRMED');
    });

    it('rejects endsAt before startsAt', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);

      const response = await request(app.server)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          title: 'Sale',
          imageKey: image.id,
          position: 'HOME_TOP',
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-08-01T00:00:00.000Z',
        })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    // The matrix's `body` is fixed per spec, but a real create needs an `imageKey`
    // that resolves to a file the owner actually uploaded — so the file in `context`
    // is created with this predictable id rather than a random one, letting the
    // static body and the per-run fixture agree.
    const FIXED_IMAGE_ID = '11111111-1111-4111-8111-111111111111';

    describeAuthzMatrix(
      {
        method: 'post',
        describe: 'POST /admin/banners',
        allowedRoles: ['ADMIN'],
        expectedOwnerStatus: 201,
        body: { title: 'Sale', imageKey: FIXED_IMAGE_ID, position: 'HOME_TOP' },
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          await seedConfirmedImage(testApp.prisma, owner.id, FIXED_IMAGE_ID);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: '/api/v1/admin/banners',
          };
        },
      },
      () => app,
    );
  });

  describe('GET /admin/banners', () => {
    it('lists every banner including inactive ones', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);
      await seedBanner(admin.id, image.id, { isActive: false });
      await seedBanner(admin.id, image.id);

      const response = await request(app.server)
        .get('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/banners',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return { owner, stranger: wrongRole, wrongRole, path: '/api/v1/admin/banners' };
        },
      },
      () => app,
    );
  });

  describe('GET /admin/banners/:id', () => {
    it('404s for an unknown id', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .get('/api/v1/admin/banners/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('BANNER_NOT_FOUND');
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/banners/:id',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          const banner = await seedBannerFixture(testApp.prisma, owner.id);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: `/api/v1/admin/banners/${banner.id}`,
          };
        },
      },
      () => app,
    );
  });

  describe('PATCH /admin/banners/:id', () => {
    it('updates fields and writes an audit row', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);
      const banner = await seedBanner(admin.id, image.id);

      const response = await request(app.server)
        .patch(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'Updated', isActive: false })
        .expect(200);

      expect(response.body).toMatchObject({ title: 'Updated', isActive: false });

      const logs = await auditLogsFor(app.prisma, banner.id);
      expect(logs.some((log) => log.action === AuditAction.BANNER_UPDATED)).toBe(true);
    });

    it('releases the previous image when it is replaced', async () => {
      const admin = await createAdmin(app);
      const oldImage = await confirmedImage(admin.id);
      const newImage = await confirmedImage(admin.id);
      const banner = await seedBanner(admin.id, oldImage.id);

      await request(app.server)
        .patch(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ imageKey: newImage.id })
        .expect(200);

      const releasedImage = await app.prisma.db.file.findUnique({ where: { id: oldImage.id } });
      expect(releasedImage?.deletedAt).not.toBeNull();
    });

    it('404s for an unknown id', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .patch('/api/v1/admin/banners/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ title: 'x' })
        .expect(404);

      expect(response.body.code).toBe('BANNER_NOT_FOUND');
    });

    describeAuthzMatrix(
      {
        method: 'patch',
        describe: 'PATCH /admin/banners/:id',
        allowedRoles: ['ADMIN'],
        body: { title: 'Updated' },
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          const banner = await seedBannerFixture(testApp.prisma, owner.id);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: `/api/v1/admin/banners/${banner.id}`,
          };
        },
      },
      () => app,
    );
  });

  describe('DELETE /admin/banners/:id', () => {
    it('soft-deletes a banner, absent from both list and public read afterwards', async () => {
      const admin = await createAdmin(app);
      const image = await confirmedImage(admin.id);
      const banner = await seedBanner(admin.id, image.id);

      await request(app.server)
        .delete(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);

      await request(app.server)
        .get(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);

      const publicList = await request(app.server).get('/api/v1/banners').expect(200);
      expect(publicList.body).toEqual([]);
    });

    describeAuthzMatrix(
      {
        method: 'delete',
        describe: 'DELETE /admin/banners/:id',
        allowedRoles: ['ADMIN'],
        expectedOwnerStatus: 204,
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          const banner = await seedBannerFixture(testApp.prisma, owner.id);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: `/api/v1/admin/banners/${banner.id}`,
          };
        },
      },
      () => app,
    );
  });
});
