import request from 'supertest';

import { anyCityId, bearer, createApprovedMaster } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

const nextWeekday = (weekday: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

describe('Search (e2e)', () => {
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

  const attachAndService = async (
    master: { accessToken: string },
    categoryId: string,
    price: number,
  ) => {
    await request(app.server)
      .post('/api/v1/masters/me/categories')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ categoryId })
      .expect(204);

    await request(app.server)
      .post('/api/v1/masters/me/services')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ categoryId, title: 'Job', priceType: 'FIXED', price, durationMinutes: 60 })
      .expect(201);
  };

  it('finds a master by full-text search over the display name', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    await app.prisma.db.masterProfile.update({
      where: { userId: master.id },
      data: { displayName: 'Zafar the Plumber' },
    });

    const found = await request(app.server)
      .get('/api/v1/masters')
      .query({ search: 'Zafar' })
      .expect(200);
    expect(found.body.items).toHaveLength(1);

    const notFound = await request(app.server)
      .get('/api/v1/masters')
      .query({ search: 'Electrician' })
      .expect(200);
    expect(notFound.body.items).toEqual([]);
  });

  it('includes descendant categories when filtering by categoryId', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const parent = await app.prisma.db.category.create({
      data: { name: 'Home Repair', slug: 'home-repair', depth: 1 },
    });
    const child = await app.prisma.db.category.create({
      data: { name: 'Plumbing', slug: 'plumbing-child', depth: 2, parentId: parent.id },
    });
    await attachAndService(master, child.id, 50);

    const byParent = await request(app.server)
      .get('/api/v1/masters')
      .query({ categoryId: parent.id })
      .expect(200);
    expect(byParent.body.items).toHaveLength(1);

    const byOtherParent = await request(app.server)
      .get('/api/v1/masters')
      .query({
        categoryId: (
          await app.prisma.db.category.create({ data: { name: 'Other', slug: 'other', depth: 1 } })
        ).id,
      })
      .expect(200);
    expect(byOtherParent.body.items).toEqual([]);
  });

  it('sorts by price ascending using the real minimum-price aggregate', async () => {
    const cityId = await anyCityId(app.prisma);
    const cheap = await createApprovedMaster(app, cityId);
    const expensive = await createApprovedMaster(app, cityId);
    const category = await app.prisma.db.category.create({
      data: { name: 'Painting', slug: 'painting', depth: 1 },
    });
    await attachAndService(cheap, category.id, 20);
    await attachAndService(expensive, category.id, 200);

    const sorted = await request(app.server)
      .get('/api/v1/masters')
      .query({ sort: 'price:asc' })
      .expect(200);

    expect(sorted.body.items.map((item: { priceFrom: string }) => item.priceFrom)).toEqual([
      '20.00',
      '200.00',
    ]);
  });

  it('filters by availableOn to masters with a working window that day', async () => {
    const cityId = await anyCityId(app.prisma);
    const available = await createApprovedMaster(app, cityId);
    const unavailable = await createApprovedMaster(app, cityId);
    const monday = nextWeekday(1);

    await request(app.server)
      .put('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(available))
      .send({ days: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }] })
      .expect(200);

    const result = await request(app.server)
      .get('/api/v1/masters')
      .query({ availableOn: monday })
      .expect(200);

    const ids = result.body.items.map((item: { id: string }) => item.id);
    const availableProfileId = (
      await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId: available.id } })
    ).id;
    const unavailableProfileId = (
      await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId: unavailable.id } })
    ).id;

    expect(ids).toContain(availableProfileId);
    expect(ids).not.toContain(unavailableProfileId);
  });
});
