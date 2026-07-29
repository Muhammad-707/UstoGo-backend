import request from 'supertest';

import {
  anyCityId,
  bearer,
  createApprovedMaster,
  createPendingMaster,
} from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/** `Asia/Tashkent` (the fixture default) is UTC+5 year-round — no DST to account for. */
const nextWeekday = (weekday: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

describe('Schedule & Availability (e2e)', () => {
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

  const seedLeafCategory = async () =>
    app.prisma.db.category.create({ data: { name: 'Plumbing', slug: 'plumbing', depth: 1 } });

  const createServiceFor = async (master: { accessToken: string }, categoryId: string) => {
    await request(app.server)
      .post('/api/v1/masters/me/categories')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ categoryId })
      .expect(204);

    const res = await request(app.server)
      .post('/api/v1/masters/me/services')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({
        categoryId,
        title: 'Leak repair',
        priceType: 'FIXED',
        price: 50,
        durationMinutes: 60,
      })
      .expect(201);
    return res.body.id as string;
  };

  it('replaces the weekly schedule atomically and rejects an overlap', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);

    const replaced = await request(app.server)
      .put('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(master))
      .send({ days: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }] })
      .expect(200);
    expect(replaced.body).toEqual([
      expect.objectContaining({ weekday: 1, startTime: '09:00', endTime: '17:00' }),
    ]);

    const listed = await request(app.server)
      .get('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(master))
      .expect(200);
    expect(listed.body).toHaveLength(1);

    await request(app.server)
      .put('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(master))
      .send({
        days: [
          { weekday: 1, startTime: '09:00', endTime: '17:00' },
          { weekday: 1, startTime: '16:00', endTime: '20:00' },
        ],
      })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('SCHEDULE_OVERLAP'));
  });

  it('manages date exceptions: create, duplicate rejection, invalid range, delete', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const date = nextWeekday(3);

    const created = await request(app.server)
      .post('/api/v1/masters/me/schedule/exceptions')
      .set('Authorization', bearer(master))
      .send({ date, isDayOff: true })
      .expect(201);
    expect(created.body).toEqual(expect.objectContaining({ date, isDayOff: true }));

    await request(app.server)
      .post('/api/v1/masters/me/schedule/exceptions')
      .set('Authorization', bearer(master))
      .send({ date, isDayOff: true })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('EXCEPTION_ALREADY_EXISTS'));

    await request(app.server)
      .post('/api/v1/masters/me/schedule/exceptions')
      .set('Authorization', bearer(master))
      .send({ date: nextWeekday(4), isDayOff: false })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('INVALID_TIME_RANGE'));

    await request(app.server)
      .delete(`/api/v1/masters/me/schedule/exceptions/${created.body.id}`)
      .set('Authorization', bearer(master))
      .expect(204);

    const list = await request(app.server)
      .get('/api/v1/masters/me/schedule/exceptions')
      .set('Authorization', bearer(master))
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('computes public availability from the weekly template and enforces the 31-day cap', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const category = await seedLeafCategory();
    const serviceId = await createServiceFor(master, category.id);
    const masterProfileId = (
      await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId: master.id } })
    ).id;

    const monday = nextWeekday(1);
    await request(app.server)
      .put('/api/v1/masters/me/schedule')
      .set('Authorization', bearer(master))
      .send({ days: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }] })
      .expect(200);

    const slots = await request(app.server)
      .get(`/api/v1/masters/${masterProfileId}/availability`)
      .query({ from: monday, to: monday, serviceId })
      .expect(200);

    // 09:00–11:00 Asia/Tashkent (UTC+5) chunked into 60-minute slots → 04:00Z, 05:00Z.
    expect(slots.body).toEqual([`${monday}T04:00:00.000Z`, `${monday}T05:00:00.000Z`]);

    await request(app.server)
      .get(`/api/v1/masters/${masterProfileId}/availability`)
      .query({ from: '2026-01-01', to: '2026-03-01', serviceId })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('DATE_RANGE_TOO_LARGE'));
  });

  it('returns 404 for availability on a master that is not public', async () => {
    const cityId = await anyCityId(app.prisma);
    const pending = await createPendingMaster(app, cityId);
    const pendingProfileId = (
      await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId: pending.id } })
    ).id;
    const monday = nextWeekday(1);

    await request(app.server)
      .get(`/api/v1/masters/${pendingProfileId}/availability`)
      .query({ from: monday, to: monday, serviceId: pendingProfileId })
      .expect(404);
  });
});
