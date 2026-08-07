import { FilePurpose } from '@prisma/client';
import request from 'supertest';

import { anyCityId, createApprovedMaster, createClient } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/** A 1x1 JPEG. Real bytes matter for the one test that exercises the actual upload. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

describe('Master portfolio (e2e)', () => {
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

  /** A confirmed File the given user owns, ready to attach as a portfolio image. */
  const seedConfirmedImage = async (
    uploadedByUserId: string,
    overrides: Partial<{ purpose: FilePurpose; isConfirmed: boolean }> = {},
  ) =>
    app.prisma.db.file.create({
      data: {
        key: `portfolio/${uploadedByUserId}/${crypto.randomUUID()}.jpg`,
        bucket: 'ustogo-test',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        purpose: overrides.purpose ?? FilePurpose.PORTFOLIO_IMAGE,
        uploadedByUserId,
        isConfirmed: overrides.isConfirmed ?? true,
      },
    });

  /** presign → PUT straight to the store → confirm. Returns the confirmed file id. */
  const uploadPortfolioImage = async (accessToken: string): Promise<string> => {
    const presign = await request(app.server)
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ purpose: 'PORTFOLIO_IMAGE', mimeType: 'image/jpeg', sizeBytes: JPEG.length })
      .expect(201);

    const upload = await fetch(presign.body.uploadUrl as string, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: JPEG,
    });
    expect(upload.status).toBe(200);

    await request(app.server)
      .post(`/api/v1/files/${presign.body.fileId}/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return presign.body.fileId as string;
  };

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /masters/me/portfolio',
      allowedRoles: ['MASTER'],
      context: async (current) => {
        const cityId = await anyCityId(current.prisma);
        const owner = await createApprovedMaster(current, cityId);
        const stranger = await createApprovedMaster(current, cityId);
        const wrongRole = await createClient(current);

        return { owner, stranger, wrongRole, path: '/api/v1/masters/me/portfolio' };
      },
    },
    () => app,
  );

  it('starts empty, then lists an added image through the real upload flow', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);

    const empty = await request(app.server)
      .get('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);
    expect(empty.body).toEqual([]);

    const fileId = await uploadPortfolioImage(master.accessToken);

    const created = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId, caption: 'Finished kitchen renovation' })
      .expect(201);

    expect(created.body).toMatchObject({
      fileId,
      caption: 'Finished kitchen renovation',
      sortOrder: 0,
    });

    const list = await request(app.server)
      .get('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: created.body.id, fileId })]);
  });

  it('assigns increasing sortOrder, reorders, and removes with a soft delete', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const first = await seedConfirmedImage(master.id);
    const second = await seedConfirmedImage(master.id);

    const firstImage = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: first.id })
      .expect(201);
    const secondImage = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: second.id })
      .expect(201);

    expect(firstImage.body.sortOrder).toBe(0);
    expect(secondImage.body.sortOrder).toBe(1);

    const reordered = await request(app.server)
      .put('/api/v1/masters/me/portfolio/order')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ imageIds: [secondImage.body.id, firstImage.body.id] })
      .expect(200);

    expect(reordered.body).toEqual([
      expect.objectContaining({ id: secondImage.body.id, sortOrder: 0 }),
      expect.objectContaining({ id: firstImage.body.id, sortOrder: 1 }),
    ]);

    await request(app.server)
      .delete(`/api/v1/masters/me/portfolio/${firstImage.body.id}`)
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(204);
    // Idempotent — removing an already-removed image is still 204.
    await request(app.server)
      .delete(`/api/v1/masters/me/portfolio/${firstImage.body.id}`)
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(204);

    const afterDelete = await request(app.server)
      .get('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);
    expect(afterDelete.body).toEqual([expect.objectContaining({ id: secondImage.body.id })]);
  });

  it('404 PORTFOLIO_IMAGE_NOT_FOUND when reordering with a foreign or unknown id', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const stranger = await createApprovedMaster(app, cityId);
    const own = await seedConfirmedImage(master.id);
    const foreign = await seedConfirmedImage(stranger.id);

    const ownImage = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: own.id })
      .expect(201);
    const foreignImage = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ fileId: foreign.id })
      .expect(201);

    const response = await request(app.server)
      .put('/api/v1/masters/me/portfolio/order')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ imageIds: [ownImage.body.id, foreignImage.body.id] })
      .expect(404);

    expect(response.body.code).toBe('PORTFOLIO_IMAGE_NOT_FOUND');
  });

  it('404 FILE_NOT_FOUND for attaching a file the caller does not own', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const stranger = await createApprovedMaster(app, cityId);
    const foreign = await seedConfirmedImage(stranger.id);

    const response = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: foreign.id })
      .expect(404);

    expect(response.body.code).toBe('FILE_NOT_FOUND');
  });

  it('404 FILE_NOT_FOUND for a confirmed file whose purpose is not PORTFOLIO_IMAGE', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const avatar = await seedConfirmedImage(master.id, { purpose: FilePurpose.AVATAR });

    await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: avatar.id })
      .expect(404);
  });

  it('409 FILE_NOT_CONFIRMED for an unconfirmed file', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const unconfirmed = await seedConfirmedImage(master.id, { isConfirmed: false });

    const response = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: unconfirmed.id })
      .expect(409);

    expect(response.body.code).toBe('FILE_NOT_CONFIRMED');
  });

  it('422 PORTFOLIO_LIMIT_EXCEEDED past the 20-image cap', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const masterProfile = await app.prisma.db.masterProfile.findUniqueOrThrow({
      where: { userId: master.id },
    });

    for (let i = 0; i < 20; i += 1) {
      const image = await seedConfirmedImage(master.id);
      await app.prisma.db.portfolioImage.create({
        data: { masterProfileId: masterProfile.id, fileId: image.id, sortOrder: i },
      });
    }

    const oneMore = await seedConfirmedImage(master.id);

    const response = await request(app.server)
      .post('/api/v1/masters/me/portfolio')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .send({ fileId: oneMore.id })
      .expect(422);

    expect(response.body.code).toBe('PORTFOLIO_LIMIT_EXCEEDED');
  });
});
