import { AuditAction } from '@prisma/client';
import request from 'supertest';

import { pollAuditLogs } from '../helpers/audit.helper';
import { bearer, createAdmin, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Marketplace (e2e)', () => {
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

  const seedCategory = async (overrides: Partial<Record<string, unknown>> = {}) =>
    app.prisma.db.productCategory.create({
      data: { name: 'Cement', slug: `cement-${Date.now()}-${Math.random()}`, ...overrides },
    });

  const seedProduct = async (
    categoryId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) =>
    app.prisma.db.product.create({
      data: {
        categoryId,
        name: 'Portland Cement 50kg',
        description: 'Standard-grade cement',
        price: 45,
        currency: 'TJS',
        images: { create: [{ imageUrl: 'https://example.com/cement.jpg', sortOrder: 0 }] },
        ...overrides,
      },
    });

  // ---------------------------------------------------------------------------
  // Product categories
  // ---------------------------------------------------------------------------

  describe('GET /product-categories', () => {
    it('returns only active categories, ordered by sortOrder', async () => {
      const second = await seedCategory({ sortOrder: 2 });
      const first = await seedCategory({ sortOrder: 1 });
      await seedCategory({ sortOrder: 0, isActive: false });

      const response = await request(app.server).get('/api/v1/product-categories').expect(200);

      expect(response.body.map((c: { id: string }) => c.id)).toEqual([first.id, second.id]);
    });
  });

  describe('POST /admin/product-categories', () => {
    it('creates a category and writes an audit row', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .post('/api/v1/admin/product-categories')
        .set('Authorization', bearer(admin))
        .send({ name: 'Paint', slug: 'paint' })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Paint', slug: 'paint', isActive: true });

      const logs = await pollAuditLogs(app.prisma, response.body.id);
      expect(logs[0]?.action).toBe(AuditAction.PRODUCT_CATEGORY_CREATED);
    });

    it('409s on a duplicate slug', async () => {
      const admin = await createAdmin(app);
      await seedCategory({ slug: 'paint' });

      const response = await request(app.server)
        .post('/api/v1/admin/product-categories')
        .set('Authorization', bearer(admin))
        .send({ name: 'Paint again', slug: 'paint' })
        .expect(409);

      expect(response.body.code).toBe('PRODUCT_CATEGORY_SLUG_TAKEN');
    });

    it('422s on a badly-shaped slug', async () => {
      const admin = await createAdmin(app);

      await request(app.server)
        .post('/api/v1/admin/product-categories')
        .set('Authorization', bearer(admin))
        .send({ name: 'Paint', slug: 'Not A Slug' })
        .expect(422);
    });

    describeAuthzMatrix(
      {
        method: 'post',
        describe: 'POST /admin/product-categories',
        allowedRoles: ['ADMIN'],
        expectedOwnerStatus: 201,
        body: { name: 'Paint', slug: `paint-${Date.now()}` },
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: '/api/v1/admin/product-categories',
          };
        },
      },
      () => app,
    );
  });

  describe('GET /admin/product-categories', () => {
    it('includes inactive categories', async () => {
      await seedCategory({ isActive: false });
      await seedCategory();

      const admin = await createAdmin(app);
      const response = await request(app.server)
        .get('/api/v1/admin/product-categories')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/product-categories',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: '/api/v1/admin/product-categories',
          };
        },
      },
      () => app,
    );
  });

  describe('PATCH /admin/product-categories/:id', () => {
    it('updates fields and writes an audit row', async () => {
      const admin = await createAdmin(app);
      const category = await seedCategory();

      const response = await request(app.server)
        .patch(`/api/v1/admin/product-categories/${category.id}`)
        .set('Authorization', bearer(admin))
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);

      const logs = await pollAuditLogs(app.prisma, category.id);
      expect(logs.some((l) => l.action === AuditAction.PRODUCT_CATEGORY_UPDATED)).toBe(true);
    });

    it('404s for an unknown id', async () => {
      const admin = await createAdmin(app);

      await request(app.server)
        .patch('/api/v1/admin/product-categories/00000000-0000-4000-8000-000000000000')
        .set('Authorization', bearer(admin))
        .send({ name: 'Renamed' })
        .expect(404);
    });
  });

  describe('DELETE /admin/product-categories/:id', () => {
    it('soft-deletes, absent from the public list afterwards', async () => {
      const admin = await createAdmin(app);
      const category = await seedCategory();

      await request(app.server)
        .delete(`/api/v1/admin/product-categories/${category.id}`)
        .set('Authorization', bearer(admin))
        .expect(204);

      const publicList = await request(app.server).get('/api/v1/product-categories').expect(200);
      expect(publicList.body).toEqual([]);

      const logs = await pollAuditLogs(app.prisma, category.id);
      expect(logs.some((l) => l.action === AuditAction.PRODUCT_CATEGORY_DELETED)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  describe('GET /products', () => {
    it('returns only active products, filterable by categoryId and search', async () => {
      const category = await seedCategory();
      const otherCategory = await seedCategory({ slug: `other-${Date.now()}` });
      const cement = await seedProduct(category.id, { name: 'Cement bag' });
      await seedProduct(category.id, { isActive: false, name: 'Discontinued' });
      await seedProduct(otherCategory.id, { name: 'Paint bucket' });

      const response = await request(app.server)
        .get('/api/v1/products')
        .query({ categoryId: category.id })
        .expect(200);

      expect(response.body.items).toEqual([expect.objectContaining({ id: cement.id })]);

      const searched = await request(app.server)
        .get('/api/v1/products')
        .query({ search: 'paint' })
        .expect(200);
      expect(searched.body.items).toHaveLength(1);
      expect(searched.body.items[0].name).toBe('Paint bucket');
    });
  });

  describe('GET /products/:id', () => {
    it('404s for an inactive product', async () => {
      const category = await seedCategory();
      const product = await seedProduct(category.id, { isActive: false });

      const response = await request(app.server).get(`/api/v1/products/${product.id}`).expect(404);

      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('returns the product detail with its images', async () => {
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      const response = await request(app.server).get(`/api/v1/products/${product.id}`).expect(200);

      expect(response.body).toMatchObject({
        id: product.id,
        name: 'Portland Cement 50kg',
        currency: 'TJS',
        imageUrls: ['https://example.com/cement.jpg'],
      });
    });
  });

  describe('POST /admin/products', () => {
    it('creates a product stamped with the deployment currency, and writes an audit row', async () => {
      const admin = await createAdmin(app);
      const category = await seedCategory();

      const response = await request(app.server)
        .post('/api/v1/admin/products')
        .set('Authorization', bearer(admin))
        .send({
          categoryId: category.id,
          name: 'Cement 50kg',
          description: 'Standard-grade cement',
          price: 45,
          imageUrls: ['https://example.com/a.jpg'],
        })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Cement 50kg', currency: 'TJS' });

      const logs = await pollAuditLogs(app.prisma, response.body.id);
      expect(logs[0]?.action).toBe(AuditAction.PRODUCT_CREATED);
    });

    it('404s for an unknown category', async () => {
      const admin = await createAdmin(app);

      const response = await request(app.server)
        .post('/api/v1/admin/products')
        .set('Authorization', bearer(admin))
        .send({
          categoryId: '00000000-0000-4000-8000-000000000000',
          name: 'Cement 50kg',
          description: 'Standard-grade cement',
          price: 45,
          imageUrls: ['https://example.com/a.jpg'],
        })
        .expect(404);

      expect(response.body.code).toBe('PRODUCT_CATEGORY_NOT_FOUND');
    });

    // The matrix's `body` is fixed per spec, but a real create needs a `categoryId`
    // that resolves to a category — so the category in `context` is created with this
    // predictable id, letting the static body and the per-run fixture agree (same
    // precedent as banners.e2e-spec.ts's FIXED_IMAGE_ID).
    const FIXED_CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

    describeAuthzMatrix(
      {
        method: 'post',
        describe: 'POST /admin/products',
        allowedRoles: ['ADMIN'],
        expectedOwnerStatus: 201,
        body: {
          categoryId: FIXED_CATEGORY_ID,
          name: 'Cement 50kg',
          description: 'Standard-grade cement',
          price: 45,
          imageUrls: ['https://example.com/a.jpg'],
        },
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);
          await testApp.prisma.db.productCategory.create({
            data: {
              id: FIXED_CATEGORY_ID,
              name: 'Cement',
              slug: `cement-${Date.now()}-${Math.random()}`,
            },
          });

          return {
            owner,
            stranger: wrongRole,
            wrongRole,
            path: '/api/v1/admin/products',
          };
        },
      },
      () => app,
    );
  });

  describe('PATCH /admin/products/:id', () => {
    it('replaces the image gallery atomically when imageUrls is given', async () => {
      const admin = await createAdmin(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      const response = await request(app.server)
        .patch(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', bearer(admin))
        .send({ imageUrls: ['https://example.com/new.jpg'] })
        .expect(200);

      expect(response.body.imageUrls).toEqual(['https://example.com/new.jpg']);
    });

    it('404s for an unknown id', async () => {
      const admin = await createAdmin(app);

      await request(app.server)
        .patch('/api/v1/admin/products/00000000-0000-4000-8000-000000000000')
        .set('Authorization', bearer(admin))
        .send({ name: 'Renamed' })
        .expect(404);
    });
  });

  describe('DELETE /admin/products/:id', () => {
    it('soft-deletes, absent from the public list afterwards', async () => {
      const admin = await createAdmin(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', bearer(admin))
        .expect(204);

      const response = await request(app.server).get(`/api/v1/products/${product.id}`).expect(404);
      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // Wishlist
  // ---------------------------------------------------------------------------

  describe('Wishlist', () => {
    it('likes and lists a product, idempotently', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);
      // Idempotent — liking twice adds one row.
      await request(app.server)
        .post(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);

      const list = await request(app.server)
        .get('/api/v1/wishlist')
        .set('Authorization', bearer(client))
        .expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id: product.id })]);
    });

    it('404s liking an inactive/unknown product', async () => {
      const client = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/wishlist/00000000-0000-4000-8000-000000000000')
        .set('Authorization', bearer(client))
        .expect(404);

      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('unlikes, idempotently, without affecting another client', async () => {
      const client = await createClient(app);
      const other = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);
      await request(app.server)
        .post(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(other))
        .expect(204);

      await request(app.server)
        .delete(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);
      // Idempotent — unliking an already-unliked product is still 204.
      await request(app.server)
        .delete(`/api/v1/wishlist/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);

      const clientList = await request(app.server)
        .get('/api/v1/wishlist')
        .set('Authorization', bearer(client))
        .expect(200);
      const otherList = await request(app.server)
        .get('/api/v1/wishlist')
        .set('Authorization', bearer(other))
        .expect(200);

      expect(clientList.body).toEqual([]);
      expect(otherList.body).toEqual([expect.objectContaining({ id: product.id })]);
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /wishlist',
        allowedRoles: ['CLIENT'],
        context: async (testApp: TestApp) => {
          const owner = await createClient(testApp);
          const stranger = await createClient(testApp);
          const wrongRole = await createAdmin(testApp);

          return { owner, stranger, wrongRole, path: '/api/v1/wishlist' };
        },
      },
      () => app,
    );
  });

  // ---------------------------------------------------------------------------
  // Cart
  // ---------------------------------------------------------------------------

  describe('Cart', () => {
    it('adds a line and reports a computed total', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id, { price: 45 });

      const response = await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id, quantity: 2 })
        .expect(200);

      expect(response.body).toMatchObject({
        items: [expect.objectContaining({ productId: product.id, quantity: 2, subtotal: '90.00' })],
        totalAmount: '90.00',
        currency: 'TJS',
      });
    });

    it('increments an already-present line instead of duplicating it', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id, quantity: 2 })
        .expect(200);
      const response = await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id, quantity: 3 })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(5);
    });

    it('404s adding an inactive/unknown product', async () => {
      const client = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);

      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('sets an exact quantity via PATCH, and 404s an absent line', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      const missing = await request(app.server)
        .patch(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', bearer(client))
        .send({ quantity: 5 })
        .expect(404);
      expect(missing.body.code).toBe('CART_ITEM_NOT_FOUND');

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id, quantity: 1 })
        .expect(200);

      const response = await request(app.server)
        .patch(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', bearer(client))
        .send({ quantity: 5 })
        .expect(200);
      expect(response.body.items[0].quantity).toBe(5);
    });

    it('removes a line idempotently', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id })
        .expect(200);

      await request(app.server)
        .delete(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);
      await request(app.server)
        .delete(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', bearer(client))
        .expect(204);

      const list = await request(app.server)
        .get('/api/v1/cart')
        .set('Authorization', bearer(client))
        .expect(200);
      expect(list.body.items).toEqual([]);
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /cart',
        allowedRoles: ['CLIENT'],
        context: async (testApp: TestApp) => {
          const owner = await createClient(testApp);
          const stranger = await createClient(testApp);
          const wrongRole = await createAdmin(testApp);

          return { owner, stranger, wrongRole, path: '/api/v1/cart' };
        },
      },
      () => app,
    );
  });

  // ---------------------------------------------------------------------------
  // Checkout & orders
  // ---------------------------------------------------------------------------

  describe('POST /orders/checkout', () => {
    it('checks out the cart into a PAID order and empties the cart', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id, { price: 45 });

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id, quantity: 2 })
        .expect(200);

      const response = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(client))
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'PAID',
        totalAmount: '90.00',
        currency: 'TJS',
        items: [expect.objectContaining({ productId: product.id, quantity: 2 })],
      });

      const cart = await request(app.server)
        .get('/api/v1/cart')
        .set('Authorization', bearer(client))
        .expect(200);
      expect(cart.body.items).toEqual([]);
    });

    it('422s CART_EMPTY when the cart has no lines', async () => {
      const client = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(client))
        .expect(422);

      expect(response.body.code).toBe('CART_EMPTY');
    });

    it('excludes a since-deactivated product, leaving it in the cart', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const stillActive = await seedProduct(category.id, { name: 'Still active', price: 10 });
      const deactivated = await seedProduct(category.id, { name: 'Will deactivate', price: 20 });

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: stillActive.id })
        .expect(200);
      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: deactivated.id })
        .expect(200);

      await app.prisma.db.product.update({
        where: { id: deactivated.id },
        data: { isActive: false },
      });

      const response = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(client))
        .expect(201);

      expect(response.body.items).toEqual([expect.objectContaining({ productId: stillActive.id })]);

      const cart = await request(app.server)
        .get('/api/v1/cart')
        .set('Authorization', bearer(client))
        .expect(200);
      expect(cart.body.items.map((i: { productId: string }) => i.productId)).toEqual([
        deactivated.id,
      ]);
    });

    it('replays the original order instead of creating a second one for the same key', async () => {
      const client = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(client))
        .send({ productId: product.id })
        .expect(200);

      const first = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(client))
        .set('Idempotency-Key', 'checkout-1')
        .expect(201);

      // The cart is now empty, so a second real checkout would 422 — the replay must
      // short-circuit before the handler runs again.
      const second = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(client))
        .set('Idempotency-Key', 'checkout-1')
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const clientProfile = await app.prisma.db.clientProfile.findUniqueOrThrow({
        where: { userId: client.id },
      });
      const orders = await app.prisma.db.order.findMany({
        where: { clientProfileId: clientProfile.id },
      });
      expect(orders).toHaveLength(1);
    });
  });

  describe('GET /orders', () => {
    it("lists only the caller's own orders, newest first", async () => {
      const client = await createClient(app);
      const other = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      const addAndCheckout = async (actor: typeof client) => {
        await request(app.server)
          .post('/api/v1/cart/items')
          .set('Authorization', bearer(actor))
          .send({ productId: product.id })
          .expect(200);

        return request(app.server)
          .post('/api/v1/orders/checkout')
          .set('Authorization', bearer(actor))
          .expect(201);
      };

      await addAndCheckout(other);
      await addAndCheckout(client);

      const response = await request(app.server)
        .get('/api/v1/orders')
        .set('Authorization', bearer(client))
        .expect(200);

      expect(response.body.items).toHaveLength(1);
    });
  });

  describe('GET /orders/:id', () => {
    it("404s for another client's order", async () => {
      const client = await createClient(app);
      const other = await createClient(app);
      const category = await seedCategory();
      const product = await seedProduct(category.id);

      await request(app.server)
        .post('/api/v1/cart/items')
        .set('Authorization', bearer(other))
        .send({ productId: product.id })
        .expect(200);
      const order = await request(app.server)
        .post('/api/v1/orders/checkout')
        .set('Authorization', bearer(other))
        .expect(201);

      const response = await request(app.server)
        .get(`/api/v1/orders/${order.body.id}`)
        .set('Authorization', bearer(client))
        .expect(404);

      expect(response.body.code).toBe('ORDER_NOT_FOUND');
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /orders/:id',
        allowedRoles: ['CLIENT'],
        context: async (testApp: TestApp) => {
          const owner = await createClient(testApp);
          const stranger = await createClient(testApp);
          const wrongRole = await createAdmin(testApp);
          const category = await testApp.prisma.db.productCategory.create({
            data: { name: 'Cement', slug: `cement-${Date.now()}-${Math.random()}` },
          });
          const product = await testApp.prisma.db.product.create({
            data: {
              categoryId: category.id,
              name: 'Cement',
              description: 'Cement',
              price: 45,
              currency: 'TJS',
            },
          });
          await request(testApp.server)
            .post('/api/v1/cart/items')
            .set('Authorization', bearer(owner))
            .send({ productId: product.id })
            .expect(200);
          const order = await request(testApp.server)
            .post('/api/v1/orders/checkout')
            .set('Authorization', bearer(owner))
            .expect(201);

          return { owner, stranger, wrongRole, path: `/api/v1/orders/${order.body.id}` };
        },
      },
      () => app,
    );
  });

  describe('Admin orders', () => {
    const seedOrder = async (clientUserId: string) => {
      const clientProfile = await app.prisma.db.clientProfile.findUniqueOrThrow({
        where: { userId: clientUserId },
      });
      const category = await seedCategory();
      const product = await seedProduct(category.id, { price: 45 });

      return app.prisma.db.order.create({
        data: {
          clientProfileId: clientProfile.id,
          totalAmount: 45,
          currency: 'TJS',
          items: {
            create: [
              { productId: product.id, productName: product.name, unitPrice: 45, quantity: 1 },
            ],
          },
        },
      });
    };

    it('lists every order for an admin', async () => {
      const admin = await createAdmin(app);
      const client = await createClient(app);
      await seedOrder(client.id);

      const response = await request(app.server)
        .get('/api/v1/admin/orders')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(response.body.items).toHaveLength(1);
    });

    it('cancels an order, writes an audit row, and 409s a second cancel', async () => {
      const admin = await createAdmin(app);
      const client = await createClient(app);
      const order = await seedOrder(client.id);

      const response = await request(app.server)
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(response.body.status).toBe('CANCELLED');

      const logs = await pollAuditLogs(app.prisma, order.id);
      expect(logs[0]?.action).toBe(AuditAction.ORDER_CANCELLED);

      const again = await request(app.server)
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('Authorization', bearer(admin))
        .expect(409);
      expect(again.body.code).toBe('ORDER_ALREADY_CANCELLED');
    });

    it('404s cancelling an unknown order', async () => {
      const admin = await createAdmin(app);

      await request(app.server)
        .post('/api/v1/admin/orders/00000000-0000-4000-8000-000000000000/cancel')
        .set('Authorization', bearer(admin))
        .expect(404);
    });

    describeAuthzMatrix(
      {
        method: 'get',
        describe: 'GET /admin/orders',
        allowedRoles: ['ADMIN'],
        context: async (testApp: TestApp) => {
          const owner = await createAdmin(testApp);
          const wrongRole = await createClient(testApp);

          return { owner, stranger: wrongRole, wrongRole, path: '/api/v1/admin/orders' };
        },
      },
      () => app,
    );
  });
});
