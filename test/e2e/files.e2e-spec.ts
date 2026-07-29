import request from 'supertest';

import { anyCityId, createClient, type Actor } from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

/** A 1x1 JPEG. Real bytes matter: confirmation reads the stored object's own metadata. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

describe('Files (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
    await anyCityId(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app.prisma);
  });

  /** presign → PUT straight to the store → confirm. Returns the confirmed file id. */
  const uploadAvatar = async (actor: Actor): Promise<string> => {
    const presign = await request(app.server)
      .post('/api/v1/files/presign')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: JPEG.length })
      .expect(201);

    const upload = await fetch(presign.body.uploadUrl as string, {
      method: 'PUT',
      // undici sets Content-Length from the body itself and rejects it being set by
      // hand; the presigned URL signs the same length, so the two still agree.
      headers: { 'Content-Type': 'image/jpeg' },
      body: JPEG,
    });
    expect(upload.status).toBe(200);

    await request(app.server)
      .post(`/api/v1/files/${presign.body.fileId}/confirm`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);

    return presign.body.fileId as string;
  };

  describeAuthzMatrix(
    {
      method: 'post',
      describe: 'POST /files/presign',
      expectedOwnerStatus: 201,
      body: { purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: 1024 },
      context: async (current) => {
        const owner = await createClient(current);
        const stranger = await createClient(current);

        return { owner, stranger, path: '/api/v1/files/presign' };
      },
    },
    () => app,
  );

  describe('POST /files/presign', () => {
    it('returns an upload URL and records the intent as unconfirmed', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      expect(response.body).toMatchObject({
        fileId: expect.any(String),
        uploadUrl: expect.any(String),
        fileKey: expect.any(String),
      });

      const row = await app.prisma.db.file.findUnique({ where: { id: response.body.fileId } });
      expect(row?.isConfirmed).toBe(false);
    });

    // The key is a path-traversal and content-type-confusion surface if it carries
    // client input; object stores accept `../` quite happily.
    it('never lets the supplied file name reach the key', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({
          purpose: 'AVATAR',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          fileName: '../../etc/passwd.jpg',
        })
        .expect(201);

      expect(response.body.fileKey).not.toContain('..');
      expect(response.body.fileKey).toMatch(/^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
    });

    it('refuses a type the purpose does not allow', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'application/pdf', sizeBytes: 1024 })
        .expect(422);

      expect(response.body.code).toBe('UNSUPPORTED_MIME_TYPE');
    });

    it('refuses a declared size beyond the purpose limit', async () => {
      const actor = await createClient(app);

      const response = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'image/png', sizeBytes: 6 * 1024 * 1024 })
        .expect(422);

      expect(response.body.code).toBe('FILE_TOO_LARGE');
    });
  });

  describe('POST /files/:id/confirm', () => {
    it('marks a real upload confirmed', async () => {
      const actor = await createClient(app);
      const fileId = await uploadAvatar(actor);

      const row = await app.prisma.db.file.findUnique({ where: { id: fileId } });
      expect(row?.isConfirmed).toBe(true);
    });

    it('is idempotent', async () => {
      const actor = await createClient(app);
      const fileId = await uploadAvatar(actor);

      await request(app.server)
        .post(`/api/v1/files/${fileId}/confirm`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);
    });

    it('refuses an upload that never arrived, and does not mark it usable', async () => {
      const actor = await createClient(app);

      const presign = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const response = await request(app.server)
        .post(`/api/v1/files/${presign.body.fileId}/confirm`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(422);

      expect(response.body.code).toBe('INVALID_FILE');

      const row = await app.prisma.db.file.findUnique({ where: { id: presign.body.fileId } });
      expect(row?.isConfirmed).toBe(false);
    });

    it("404 for another user's file, not 403", async () => {
      const owner = await createClient(app);
      const stranger = await createClient(app);
      const fileId = await uploadAvatar(owner);

      const response = await request(app.server)
        .post(`/api/v1/files/${fileId}/confirm`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('GET /files/:id/url', () => {
    it('serves the bytes back to the owner', async () => {
      const actor = await createClient(app);
      const fileId = await uploadAvatar(actor);

      const response = await request(app.server)
        .get(`/api/v1/files/${fileId}/url`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      const fetched = await fetch(response.body.url as string);
      expect(fetched.status).toBe(200);
      expect(Number(fetched.headers.get('content-length'))).toBe(JPEG.length);
    });

    // API1 Broken Object Level Authorization: ids must not be walkable for another
    // user's certificates.
    it("404 for another user's file", async () => {
      const owner = await createClient(app);
      const stranger = await createClient(app);
      const fileId = await uploadAvatar(owner);

      const response = await request(app.server)
        .get(`/api/v1/files/${fileId}/url`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('FILE_NOT_FOUND');
    });

    it('409 for a file that has not been confirmed', async () => {
      const actor = await createClient(app);

      const presign = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const response = await request(app.server)
        .get(`/api/v1/files/${presign.body.fileId}/url`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(409);

      expect(response.body.code).toBe('FILE_NOT_CONFIRMED');
    });
  });

  // FR-3.3, the journey the file module exists to serve.
  describe('PATCH /users/me/avatar', () => {
    it('attaches a confirmed file and releases the previous one', async () => {
      const actor = await createClient(app);

      const first = await uploadAvatar(actor);
      await request(app.server)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ fileId: first })
        .expect(200);

      const second = await uploadAvatar(actor);
      const response = await request(app.server)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ fileId: second })
        .expect(200);

      expect(response.body.clientProfile.avatarFileId).toBe(second);

      // The replaced avatar is scheduled for deletion, not left paid for indefinitely.
      const previous = await app.prisma.file.findUnique({ where: { id: first } });
      expect(previous?.deletedAt).not.toBeNull();
    });

    it('refuses a file that has not been confirmed', async () => {
      const actor = await createClient(app);

      const presign = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'AVATAR', mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const response = await request(app.server)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ fileId: presign.body.fileId })
        .expect(409);

      expect(response.body.code).toBe('FILE_NOT_CONFIRMED');
    });

    it("refuses another user's file with 404", async () => {
      const owner = await createClient(app);
      const stranger = await createClient(app);
      const fileId = await uploadAvatar(owner);

      await request(app.server)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ fileId })
        .expect(404);
    });

    // A certificate must not become an avatar just because both are images.
    it('refuses a file uploaded for a different purpose', async () => {
      const actor = await createClient(app);

      const presign = await request(app.server)
        .post('/api/v1/files/presign')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ purpose: 'CERTIFICATE', mimeType: 'image/jpeg', sizeBytes: JPEG.length })
        .expect(201);

      await fetch(presign.body.uploadUrl as string, {
        method: 'PUT',
        // undici sets Content-Length from the body itself and rejects it being set by
        // hand; the presigned URL signs the same length, so the two still agree.
        headers: { 'Content-Type': 'image/jpeg' },
        body: JPEG,
      });

      await request(app.server)
        .post(`/api/v1/files/${presign.body.fileId}/confirm`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      await request(app.server)
        .patch('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ fileId: presign.body.fileId })
        .expect(404);
    });
  });
});
