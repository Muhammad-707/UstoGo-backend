import { AuditAction } from '@prisma/client';
import request from 'supertest';

import { createAdmin, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Categories (e2e)', () => {
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

  const seedRoot = async (overrides: Partial<Record<string, unknown>> = {}) =>
    app.prisma.db.category.create({
      data: { name: 'Home Services', slug: 'home-services', depth: 1, ...overrides },
    });

  describe('GET /categories', () => {
    it('returns the active tree, nested and leaf-flagged', async () => {
      const root = await seedRoot();
      await app.prisma.db.category.create({
        data: { name: 'Plumbing', slug: 'plumbing', parentId: root.id, depth: 2 },
      });
      await app.prisma.db.category.create({
        data: { name: 'Hidden', slug: 'hidden', depth: 1, isActive: false },
      });

      const response = await request(app.server).get('/api/v1/categories').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].slug).toBe('home-services');
      expect(response.body[0].isLeaf).toBe(false);
      expect(response.body[0].children[0].slug).toBe('plumbing');
      expect(response.body[0].children[0].isLeaf).toBe(true);
    });
  });

  describe('GET /categories/:slug', () => {
    it('returns ancestors root-first and one level of children', async () => {
      const root = await seedRoot();
      const child = await app.prisma.db.category.create({
        data: { name: 'Plumbing', slug: 'plumbing', parentId: root.id, depth: 2 },
      });
      await app.prisma.db.category.create({
        data: { name: 'Leak Repair', slug: 'leak-repair', parentId: child.id, depth: 3 },
      });

      const response = await request(app.server).get('/api/v1/categories/plumbing').expect(200);

      expect(response.body.ancestors).toEqual([expect.objectContaining({ slug: 'home-services' })]);
      expect(response.body.children).toEqual([expect.objectContaining({ slug: 'leak-repair' })]);
    });

    it('404s for an inactive category', async () => {
      await seedRoot({ isActive: false });

      const response = await request(app.server)
        .get('/api/v1/categories/home-services')
        .expect(404);

      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    });
  });

  describe('POST /admin/categories', () => {
    it('creates a root category and writes an audit row', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Plumbing', slug: 'plumbing' })
        .expect(201);

      expect(response.body).toMatchObject({ slug: 'plumbing', depth: 1 });

      const logs = await app.prisma.db.auditLog.findMany({ where: { entityId: response.body.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.action).toBe(AuditAction.CATEGORY_CREATED);
      expect(logs[0]?.actorUserId).toBe(admin.id);
    });

    it('rejects a depth-4 category', async () => {
      const admin = await createAdmin(app);
      const l1 = await seedRoot();
      const l2 = await app.prisma.db.category.create({
        data: { name: 'L2', slug: 'l2', parentId: l1.id, depth: 2 },
      });
      const l3 = await app.prisma.db.category.create({
        data: { name: 'L3', slug: 'l3', parentId: l2.id, depth: 3 },
      });

      const response = await request(app.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'L4', slug: 'l4', parentId: l3.id })
        .expect(422);

      expect(response.body.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    });

    it('rejects a duplicate slug', async () => {
      const admin = await createAdmin(app);
      await seedRoot();

      const response = await request(app.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Dup', slug: 'home-services' })
        .expect(409);

      expect(response.body.code).toBe('CATEGORY_SLUG_TAKEN');
    });
  });

  describe('PATCH /admin/categories/:id', () => {
    it('renames a category and never accepts a slug change', async () => {
      const admin = await createAdmin(app);
      const category = await seedRoot();

      const response = await request(app.server)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Renamed', slug: 'ignored' })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects reparenting a category under its own descendant', async () => {
      const admin = await createAdmin(app);
      const root = await seedRoot();
      const child = await app.prisma.db.category.create({
        data: { name: 'Child', slug: 'child', parentId: root.id, depth: 2 },
      });

      const response = await request(app.server)
        .patch(`/api/v1/admin/categories/${root.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ parentId: child.id })
        .expect(422);

      expect(response.body.code).toBe('CATEGORY_INVALID_PARENT');
    });
  });

  describe('DELETE /admin/categories/:id', () => {
    it('deletes a childless category', async () => {
      const admin = await createAdmin(app);
      const category = await seedRoot();

      await request(app.server)
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);

      await request(app.server).get('/api/v1/categories/home-services').expect(404);
    });

    it('refuses to delete a category with a child', async () => {
      const admin = await createAdmin(app);
      const root = await seedRoot();
      await app.prisma.db.category.create({
        data: { name: 'Child', slug: 'child', parentId: root.id, depth: 2 },
      });

      const response = await request(app.server)
        .delete(`/api/v1/admin/categories/${root.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      expect(response.body.code).toBe('CATEGORY_IN_USE');
    });

    describeAuthzMatrix(
      {
        method: 'delete',
        describe: 'DELETE /admin/categories/:id',
        allowedRoles: ['ADMIN'],
        expectedOwnerStatus: 204,
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          const category = await testApp.prisma.db.category.create({
            data: { name: 'Home Services', slug: 'home-services', depth: 1 },
          });

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: `/api/v1/admin/categories/${category.id}`,
          };
        },
      },
      () => app,
    );
  });
});
