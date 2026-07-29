import request from 'supertest';

import {
  anyCityId,
  bearer,
  createAdmin,
  createApprovedMaster,
  createClient,
} from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Reviews (e2e)', () => {
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

  /** Fast-forwards straight to a COMPLETED booking — the same honest shortcut `createApprovedMaster` takes for moderation. */
  const seedCompletedBooking = async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const client = await createClient(app);
    const category = await app.prisma.db.category.create({
      data: { name: 'Plumbing', slug: `plumbing-${Date.now()}`, depth: 1 },
    });
    const masterProfile = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { userId: master.id },
    });
    const clientProfile = await app.prisma.db.clientProfile.findUniqueOrThrow({
      where: { userId: client.id },
    });
    const service = await app.prisma.db.service.create({
      data: {
        masterProfileId: masterProfile.id,
        categoryId: category.id,
        title: 'Leak repair',
        priceType: 'FIXED',
        price: 50,
        currency: 'USD',
        durationMinutes: 60,
      },
    });

    const booking = await app.prisma.db.booking.create({
      data: {
        bookingNumber: `UG-${Date.now()}`,
        clientProfileId: clientProfile.id,
        masterProfileId: masterProfile.id,
        serviceId: service.id,
        status: 'COMPLETED',
        scheduledAt: new Date(Date.now() - 3 * 3_600_000),
        endsAt: new Date(Date.now() - 2 * 3_600_000),
        durationMinutes: 60,
        serviceTitle: service.title,
        price: service.price,
        priceType: service.priceType,
        currency: service.currency,
        addressLine: 'A',
        addressDistrict: 'B',
        completedAt: new Date(Date.now() - 2 * 3_600_000),
      },
    });

    return { master, client, masterProfile, booking };
  };

  it('creates a review, recomputes the aggregate, edits within the window, and replies', async () => {
    const { master, client, masterProfile, booking } = await seedCompletedBooking();

    const created = await request(app.server)
      .post('/api/v1/reviews')
      .set('Authorization', bearer(client))
      .send({ bookingId: booking.id, rating: 5, comment: 'Great job' })
      .expect(201);

    const afterCreate = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: masterProfile.id },
    });
    expect(afterCreate.ratingAverage.toNumber()).toBe(5);
    expect(afterCreate.ratingCount).toBe(1);

    await request(app.server)
      .post('/api/v1/reviews')
      .set('Authorization', bearer(client))
      .send({ bookingId: booking.id, rating: 4 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('REVIEW_ALREADY_EXISTS'));

    const updated = await request(app.server)
      .patch(`/api/v1/reviews/${created.body.id}`)
      .set('Authorization', bearer(client))
      .send({ rating: 3 })
      .expect(200);
    expect(updated.body.rating).toBe(3);

    const afterEdit = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: masterProfile.id },
    });
    expect(afterEdit.ratingAverage.toNumber()).toBe(3);

    const replied = await request(app.server)
      .post(`/api/v1/reviews/${created.body.id}/reply`)
      .set('Authorization', bearer(master))
      .send({ body: 'Thank you!' })
      .expect(201);
    expect(replied.body.body).toBe('Thank you!');

    await request(app.server)
      .post(`/api/v1/reviews/${created.body.id}/reply`)
      .set('Authorization', bearer(master))
      .send({ body: 'Again?' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('REPLY_ALREADY_EXISTS'));
  });

  it('excludes a hidden review from public listing and aggregates, then restores it on unhide', async () => {
    const { client, master, masterProfile, booking } = await seedCompletedBooking();
    const admin = await createAdmin(app);

    const created = await request(app.server)
      .post('/api/v1/reviews')
      .set('Authorization', bearer(client))
      .send({ bookingId: booking.id, rating: 5 })
      .expect(201);

    await request(app.server)
      .post(`/api/v1/admin/reviews/${created.body.id}/hide`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Inappropriate language reported by user' })
      .expect(200);

    const hiddenAggregate = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: masterProfile.id },
    });
    expect(hiddenAggregate.ratingCount).toBe(0);

    const publicListing = await request(app.server)
      .get(`/api/v1/masters/${masterProfile.id}/reviews`)
      .expect(200);
    expect(publicListing.body.items).toHaveLength(0);

    await request(app.server)
      .post(`/api/v1/admin/reviews/${created.body.id}/unhide`)
      .set('Authorization', bearer(admin))
      .expect(200);

    const restoredAggregate = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: masterProfile.id },
    });
    expect(restoredAggregate.ratingCount).toBe(1);

    void master;
  });

  it('lets exactly one of two concurrent review creations on the same booking succeed', async () => {
    const { client, booking } = await seedCompletedBooking();

    const [resultA, resultB] = await Promise.all([
      request(app.server)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(client))
        .send({ bookingId: booking.id, rating: 5 }),
      request(app.server)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(client))
        .send({ bookingId: booking.id, rating: 2 }),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const reviewCount = await app.prisma.db.review.count({ where: { bookingId: booking.id } });
    expect(reviewCount).toBe(1);
  });
});
