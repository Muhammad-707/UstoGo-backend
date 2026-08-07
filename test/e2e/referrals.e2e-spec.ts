import request from 'supertest';

import {
  anyCityId,
  bearer,
  createAdmin,
  createApprovedMaster,
  createClient,
} from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
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

describe('Referrals (e2e)', () => {
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

  const myReferral = (accessToken: string) =>
    request(app.server).get('/api/v1/me/referral').set('Authorization', `Bearer ${accessToken}`);

  /**
   * `ReferralRewardListener` runs off `BookingCompletedEvent`, fired after the
   * completing transaction commits but never awaited by the HTTP response (same
   * fire-and-forget shape `AuditInterceptor` uses — `audit.helper.ts`'s own docstring).
   * A test asserting on the reward immediately after `.../complete` responds is racing
   * it, so this polls `GET /me/referral` briefly instead of reading once.
   */
  const pollRewardCount = async (accessToken: string): Promise<number> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await myReferral(accessToken).expect(200);
      if (response.body.rewardCount > 0) {
        return response.body.rewardCount as number;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return 0;
  };

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

  /** Books, accepts, starts and completes a booking for `client` — the referral reward
   *  trigger is "first COMPLETED booking", so this is the shortest path to it. */
  const completeABooking = async (clientAccessToken: string): Promise<void> => {
    const { master, masterProfileId, serviceId, scheduledAt, cityId } =
      await seedMasterWithService();

    const created = await request(app.server)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${clientAccessToken}`)
      .send({
        masterId: masterProfileId,
        serviceId,
        scheduledAt,
        address: { cityId, line: '123 Main St', district: 'Downtown' },
      })
      .expect(201);
    const bookingId = created.body.id as string;

    await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/accept`)
      .set('Authorization', bearer(master))
      .expect(200);

    await app.prisma.db.booking.update({
      where: { id: bookingId },
      data: { scheduledAt: new Date(Date.now() + 60_000) },
    });

    await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/start`)
      .set('Authorization', bearer(master))
      .expect(200);

    await request(app.server)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', bearer(master))
      .expect(200);
  };

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /me/referral',
      allowedRoles: ['CLIENT'],
      context: async (current) => {
        const owner = await createClient(current);
        const stranger = await createClient(current);
        const wrongRole = await createAdmin(current);

        return { owner, stranger, wrongRole, path: '/api/v1/me/referral' };
      },
    },
    () => app,
  );

  it('lazily generates a stable referral code on first call', async () => {
    const client = await createClient(app);

    const first = await myReferral(client.accessToken).expect(200);
    expect(first.body).toEqual({
      code: expect.any(String),
      referredCount: 0,
      rewardCount: 0,
      totalBonus: 0,
    });
    expect(first.body.code).toHaveLength(8);

    const second = await myReferral(client.accessToken).expect(200);
    expect(second.body.code).toBe(first.body.code);
  });

  it('links a referred client at registration and counts them for the referrer', async () => {
    const referrer = await createClient(app);
    const code = (await myReferral(referrer.accessToken).expect(200)).body.code as string;

    await createClient(app, { referralCode: code });

    const referrerView = await myReferral(referrer.accessToken).expect(200);
    expect(referrerView.body.referredCount).toBe(1);
    expect(referrerView.body.rewardCount).toBe(0);
  });

  it('never fails registration over an unknown referral code', async () => {
    const stranger = await createClient(app, { referralCode: 'NOSUCHCODE' });

    const view = await myReferral(stranger.accessToken).expect(200);
    expect(view.body.referredCount).toBe(0);
  });

  it('awards the referrer once the referred client completes their first booking', async () => {
    const referrer = await createClient(app);
    const code = (await myReferral(referrer.accessToken).expect(200)).body.code as string;

    const referred = await createClient(app, { referralCode: code });

    await completeABooking(referred.accessToken);

    const rewardCount = await pollRewardCount(referrer.accessToken);
    expect(rewardCount).toBe(1);

    const referrerView = await myReferral(referrer.accessToken).expect(200);
    expect(referrerView.body).toMatchObject({ referredCount: 1, rewardCount: 1, totalBonus: 5 });
  });

  it('does not reward a client who was never referred', async () => {
    const client = await createClient(app);

    await completeABooking(client.accessToken);

    const view = await myReferral(client.accessToken).expect(200);
    expect(view.body).toMatchObject({ referredCount: 0, rewardCount: 0, totalBonus: 0 });
  });
});
