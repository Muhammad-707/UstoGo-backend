import request from 'supertest';

import { anyCityId, bearer, createApprovedMaster, createClient } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/** `Asia/Tashkent` (the fixture default) is UTC+5 year-round — no DST to account for. */
const nextWeekday = (weekday: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

describe('Idempotency (e2e)', () => {
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

  const seedMasterWithService = async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const category = await app.prisma.db.category.create({
      data: { name: 'Plumbing', slug: `plumbing-${Date.now()}`, depth: 1 },
    });

    await request(app.server)
      .post('/api/v1/masters/me/categories')
      .set('Authorization', bearer(master))
      .send({ categoryId: category.id })
      .expect(204);

    const service = await request(app.server)
      .post('/api/v1/masters/me/services')
      .set('Authorization', bearer(master))
      .send({
        categoryId: category.id,
        title: 'Leak repair',
        priceType: 'FIXED',
        price: 50,
        durationMinutes: 60,
      })
      .expect(201);

    await request(app.server)
      .put('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(master))
      .send({ days: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }] })
      .expect(200);

    const masterProfileId = (
      await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId: master.id } })
    ).id;

    const monday = nextWeekday(1);
    const scheduledAt = `${monday}T04:00:00.000Z`;

    return { master, masterProfileId, serviceId: service.body.id as string, scheduledAt, cityId };
  };

  it('replays the original response instead of creating a second booking', async () => {
    const { masterProfileId, serviceId, scheduledAt, cityId } = await seedMasterWithService();
    const client = await createClient(app);
    const payload = {
      masterId: masterProfileId,
      serviceId,
      scheduledAt,
      address: { cityId: cityId, line: '123 Main St', district: 'Downtown' },
    };

    const first = await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .set('Idempotency-Key', 'retry-1')
      .send(payload)
      .expect(201);

    const second = await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .set('Idempotency-Key', 'retry-1')
      .send(payload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const bookings = await app.prisma.db.booking.findMany({ where: { masterProfileId } });
    expect(bookings).toHaveLength(1);
  });

  it('rejects the same key reused for a different request', async () => {
    const { masterProfileId, serviceId, scheduledAt, cityId } = await seedMasterWithService();
    const client = await createClient(app);

    await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .set('Idempotency-Key', 'retry-2')
      .send({
        masterId: masterProfileId,
        serviceId,
        scheduledAt,
        address: { cityId: cityId, line: '123 Main St', district: 'Downtown' },
      })
      .expect(201);

    await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .set('Idempotency-Key', 'retry-2')
      .send({
        masterId: masterProfileId,
        serviceId,
        scheduledAt,
        address: { cityId: cityId, line: '456 Other St', district: 'Uptown' },
      })
      .expect(409);
  });

  it('creates two bookings when no key is sent at all', async () => {
    const { masterProfileId, serviceId, scheduledAt, cityId } = await seedMasterWithService();
    const client = await createClient(app);
    const other = await createClient(app);
    const payload = {
      masterId: masterProfileId,
      serviceId,
      scheduledAt,
      address: { cityId: cityId, line: '123 Main St', district: 'Downtown' },
    };

    await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .send(payload)
      .expect(201);

    // A different client, same slot request shape, no key at all: unaffected by the
    // other client's idempotency row, since rows are scoped by (userId, key).
    await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(other))
      .send(payload)
      .expect(201);

    const bookings = await app.prisma.db.booking.findMany({ where: { masterProfileId } });
    expect(bookings).toHaveLength(2);
  });
});
