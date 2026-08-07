import request from 'supertest';

import { anyCityId, bearer, createApprovedMaster, createClient } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Booking payment confirmation (e2e)', () => {
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

  /** Fast-forwards straight to a COMPLETED booking, matching reviews.e2e-spec.ts's own shortcut. */
  const seedBooking = async (status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED') => {
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
        currency: 'TJS',
        durationMinutes: 60,
      },
    });

    const booking = await app.prisma.db.booking.create({
      data: {
        bookingNumber: `UG-${Date.now()}`,
        clientProfileId: clientProfile.id,
        masterProfileId: masterProfile.id,
        serviceId: service.id,
        status,
        scheduledAt: new Date(Date.now() - 3 * 3_600_000),
        endsAt: new Date(Date.now() - 2 * 3_600_000),
        durationMinutes: 60,
        serviceTitle: service.title,
        price: service.price,
        priceType: service.priceType,
        currency: service.currency,
        addressLine: 'A',
        addressDistrict: 'B',
        completedAt: status === 'COMPLETED' ? new Date(Date.now() - 2 * 3_600_000) : null,
      },
    });

    return { master, client, booking };
  };

  it('confirms payment of the full agreed price with no note required', async () => {
    const { client, booking } = await seedBooking();

    const res = await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 50 })
      .expect(200);

    expect(res.body.paidAmount).toBe('50.00');
    expect(res.body.paymentNote).toBeNull();
    expect(res.body.paymentConfirmedAt).not.toBeNull();
  });

  it('records an above-price payment as a tip with no note required', async () => {
    const { client, booking } = await seedBooking();

    const res = await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 65 })
      .expect(200);

    expect(res.body.paidAmount).toBe('65.00');
  });

  it('rejects an underpayment with no note, 422 PAYMENT_NOTE_REQUIRED', async () => {
    const { client, booking } = await seedBooking();

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 30 })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('PAYMENT_NOTE_REQUIRED'));
  });

  it('accepts an underpayment once a note explains it', async () => {
    const { client, booking } = await seedBooking();

    const res = await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 30, note: 'The wall was left unpainted.' })
      .expect(200);

    expect(res.body.paidAmount).toBe('30.00');
    expect(res.body.paymentNote).toBe('The wall was left unpainted.');
  });

  it('rejects a second confirmation, 409 PAYMENT_ALREADY_CONFIRMED', async () => {
    const { client, booking } = await seedBooking();

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 50 })
      .expect(200);

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 50 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('PAYMENT_ALREADY_CONFIRMED'));
  });

  it('rejects confirmation on a non-COMPLETED booking, 409 BOOKING_NOT_COMPLETED', async () => {
    const { client, booking } = await seedBooking('IN_PROGRESS');

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(client))
      .send({ paidAmount: 50 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('BOOKING_NOT_COMPLETED'));
  });

  it('rejects a stranger with 404, never 403', async () => {
    const { booking } = await seedBooking();
    const stranger = await createClient(app);

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(stranger))
      .send({ paidAmount: 50 })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('BOOKING_NOT_FOUND'));
  });

  it('rejects a master caller with 403 — client-only', async () => {
    const { master, booking } = await seedBooking();

    await request(app.server)
      .post(`/api/v1/bookings/${booking.id}/confirm-payment`)
      .set('Authorization', bearer(master))
      .send({ paidAmount: 50 })
      .expect(403);
  });
});
