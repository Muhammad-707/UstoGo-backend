import { Prisma } from '@prisma/client';
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

describe('Bookings (e2e)', () => {
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
    // 09:00 Asia/Tashkent (UTC+5) → 04:00Z, comfortably >2h from "now".
    const scheduledAt = `${monday}T04:00:00.000Z`;

    return { master, masterProfileId, serviceId: service.body.id as string, scheduledAt };
  };

  it('creates, accepts, starts, completes a booking and hides the client phone until acceptance', async () => {
    const { master, masterProfileId, serviceId, scheduledAt } = await seedMasterWithService();
    const client = await createClient(app);

    const created = await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .send({
        masterId: masterProfileId,
        serviceId,
        scheduledAt,
        address: { line: '123 Main St', district: 'Downtown' },
      })
      .expect(201);

    expect(created.body.status).toBe('PENDING');
    const bookingId = created.body.id as string;

    const pendingView = await request(app.server)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', bearer(master))
      .expect(200);
    expect(pendingView.body.clientPhone).toBeNull();
    expect(pendingView.body.addressLine).toBeNull();

    const accepted = await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/accept`)
      .set('Authorization', bearer(master))
      .expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');

    const acceptedView = await request(app.server)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', bearer(master))
      .expect(200);
    expect(acceptedView.body.addressLine).toBe('123 Main St');
    expect(acceptedView.body.history).toHaveLength(2);

    await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/start`)
      .set('Authorization', bearer(master))
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('TOO_EARLY_TO_START'));

    await app.prisma.db.booking.update({
      where: { id: bookingId },
      data: { scheduledAt: new Date(Date.now() + 60_000) },
    });

    await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/start`)
      .set('Authorization', bearer(master))
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('IN_PROGRESS'));

    const completed = await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', bearer(master))
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');
  });

  it('rejects an illegal transition with 409 ILLEGAL_BOOKING_TRANSITION', async () => {
    const { masterProfileId, serviceId, scheduledAt, master } = await seedMasterWithService();
    const client = await createClient(app);

    const created = await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', bearer(client))
      .send({
        masterId: masterProfileId,
        serviceId,
        scheduledAt,
        address: { line: '456 Oak Avenue', district: 'Downtown' },
      })
      .expect(201);

    await request(app.server)
      .post(`/api/v1/bookings/${created.body.id}/start`)
      .set('Authorization', bearer(master))
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('ILLEGAL_BOOKING_TRANSITION'));
  });

  it('lets exactly one of two concurrent accepts on overlapping bookings succeed', async () => {
    const { masterProfileId, serviceId, scheduledAt, master } = await seedMasterWithService();
    const clientA = await createClient(app);
    const clientB = await createClient(app);

    // Same master, same slot: legal because both remain PENDING until one is accepted.
    const [bookingA, bookingB] = await Promise.all([
      request(app.server)
        .post('/api/v1/bookings')
        .set('Authorization', bearer(clientA))
        .send({
          masterId: masterProfileId,
          serviceId,
          scheduledAt,
          address: { line: '456 Oak Avenue', district: 'Downtown' },
        })
        .expect(201),
      request(app.server)
        .post('/api/v1/bookings')
        .set('Authorization', bearer(clientB))
        .send({
          masterId: masterProfileId,
          serviceId,
          scheduledAt,
          address: { line: '789 Pine Road', district: 'Uptown' },
        })
        .expect(201),
    ]);

    const [resultA, resultB] = await Promise.all([
      request(app.server)
        .post(`/api/v1/bookings/${bookingA.body.id}/accept`)
        .set('Authorization', bearer(master)),
      request(app.server)
        .post(`/api/v1/bookings/${bookingB.body.id}/accept`)
        .set('Authorization', bearer(master)),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = resultA.status === 200 ? resultA : resultB;
    const loser = resultA.status === 200 ? resultB : resultA;
    expect(winner.body.status).toBe('ACCEPTED');
    expect(loser.body.code).toBe('BOOKING_OVERLAP');
  });

  it('rejects a direct insert that bypasses the service — the GiST exclusion constraint fires', async () => {
    const { masterProfileId, serviceId, scheduledAt } = await seedMasterWithService();
    const client = await createClient(app);
    const clientProfile = await app.prisma.db.clientProfile.findUniqueOrThrow({
      where: { userId: client.id },
    });
    const service = await app.prisma.db.service.findUniqueOrThrow({ where: { id: serviceId } });

    const base = {
      clientProfileId: clientProfile.id,
      masterProfileId,
      serviceId,
      status: 'ACCEPTED' as const,
      scheduledAt: new Date(scheduledAt),
      endsAt: new Date(new Date(scheduledAt).getTime() + service.durationMinutes * 60_000),
      durationMinutes: service.durationMinutes,
      serviceTitle: service.title,
      price: service.price,
      priceType: service.priceType,
      currency: service.currency,
      addressLine: 'A',
      addressDistrict: 'B',
    };

    await app.prisma.db.booking.create({ data: { ...base, bookingNumber: 'UG-TEST-000001' } });

    await expect(
      app.prisma.db.booking.create({ data: { ...base, bookingNumber: 'UG-TEST-000002' } }),
    ).rejects.toThrow(Prisma.PrismaClientUnknownRequestError);
  });
});
