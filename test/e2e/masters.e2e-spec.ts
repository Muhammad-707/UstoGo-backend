import request from 'supertest';

import { pollAuditLogs } from '../helpers/audit.helper';
import { anyCityId, createAdmin, createPendingMaster } from '../helpers/auth.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Masters (e2e)', () => {
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

  const masterProfileIdFor = async (userId: string): Promise<string> => {
    const profile = await app.prisma.db.masterProfile.findUniqueOrThrow({ where: { userId } });
    return profile.id;
  };

  it('takes a master from registration to approved and publicly discoverable', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createPendingMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);
    const category = await seedLeafCategory();
    const admin = await createAdmin(app);

    // Not ready yet — no category, no service.
    await request(app.server)
      .post(`/api/v1/admin/masters/${masterProfileId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(409);

    await request(app.server)
      .post('/api/v1/masters/me/categories')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ categoryId: category.id })
      .expect(204);

    await request(app.server)
      .post('/api/v1/masters/me/services')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({
        categoryId: category.id,
        title: 'Leak repair',
        priceType: 'FIXED',
        price: 50,
        durationMinutes: 60,
      })
      .expect(201);

    const approved = await request(app.server)
      .post(`/api/v1/admin/masters/${masterProfileId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(approved.body.approvalStatus).toBe('APPROVED');

    const audit = await pollAuditLogs(app.prisma, masterProfileId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('MASTER_APPROVED');

    const publicList = await request(app.server).get('/api/v1/masters').expect(200);
    expect(publicList.body.items).toEqual([expect.objectContaining({ id: masterProfileId })]);

    const publicProfile = await request(app.server)
      .get(`/api/v1/masters/${masterProfileId}`)
      .expect(200);
    expect(JSON.stringify(publicProfile.body)).not.toContain('email');
  });

  it('rejects a pending master with a reason and blocks re-approval without resubmit', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createPendingMaster(app, cityId);
    const masterProfileId = await masterProfileIdFor(master.id);
    const admin = await createAdmin(app);

    await request(app.server)
      .post(`/api/v1/admin/masters/${masterProfileId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Certificates did not match the claimed experience.' })
      .expect(200);

    await request(app.server)
      .post(`/api/v1/admin/masters/${masterProfileId}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(409);

    const resubmitted = await request(app.server)
      .post('/api/v1/masters/me/resubmit')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);

    expect(resubmitted.body.approvalStatus).toBe('PENDING');
    expect(resubmitted.body.rejectionReason).toBeNull();
  });
});
