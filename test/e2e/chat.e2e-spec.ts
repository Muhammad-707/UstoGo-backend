import type { AddressInfo } from 'node:net';

import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import {
  anyCityId,
  bearer,
  createApprovedMaster,
  createClient,
  type Actor,
} from '../helpers/auth.helper';
import { describeAuthzMatrix } from '../helpers/authz-matrix.helper';
import { createTestApp, truncateAll, type TestApp } from '../helpers/test-app.factory';

describe('Chat (e2e)', () => {
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

  /** Same honest shortcut `reviews.e2e-spec.ts` takes for a `COMPLETED` booking —
   *  chat only needs a booking row to exist, not the full acceptance flow. */
  const seedBookedPair = async (): Promise<{
    client: Actor;
    master: Actor;
  }> => {
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

    await app.prisma.db.booking.create({
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

    return { client, master };
  };

  it('BR-60: a second POST /conversations for the same pair returns the existing row', async () => {
    const { client, master } = await seedBookedPair();

    const first = await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);

    const second = await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const count = await app.prisma.db.conversation.count();
    expect(count).toBe(1);
  });

  it('enforces NO_SHARED_BOOKING when the two have never booked each other', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const client = await createClient(app);

    await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('NO_SHARED_BOOKING'));
  });

  it('reads "non-expired" narrowly: a booking that only ever reached EXPIRED does not qualify', async () => {
    const cityId = await anyCityId(app.prisma);
    const master = await createApprovedMaster(app, cityId);
    const client = await createClient(app);
    const category = await app.prisma.db.category.create({
      data: { name: 'Electrical', slug: `electrical-${Date.now()}`, depth: 1 },
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
        title: 'Rewiring',
        priceType: 'FIXED',
        price: 80,
        currency: 'USD',
        durationMinutes: 60,
      },
    });
    await app.prisma.db.booking.create({
      data: {
        bookingNumber: `UG-EXP-${Date.now()}`,
        clientProfileId: clientProfile.id,
        masterProfileId: masterProfile.id,
        serviceId: service.id,
        status: 'EXPIRED',
        scheduledAt: new Date(Date.now() - 48 * 3_600_000),
        endsAt: new Date(Date.now() - 47 * 3_600_000),
        durationMinutes: 60,
        serviceTitle: service.title,
        price: service.price,
        priceType: service.priceType,
        currency: service.currency,
        addressLine: 'A',
        addressDistrict: 'B',
      },
    });

    await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('NO_SHARED_BOOKING'));
  });

  it('a CANCELLED booking still qualifies — the pair genuinely engaged each other', async () => {
    const { client, master } = await seedBookedPair();

    await app.prisma.db.booking.updateMany({
      data: { status: 'CANCELLED_BY_CLIENT', cancelledAt: new Date() },
    });

    await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);
  });

  it('sends a message, updates the conversation summary, and reports it in unread counts', async () => {
    const { client, master } = await seedBookedPair();

    const conversation = await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);

    await request(app.server)
      .post(`/api/v1/conversations/${String(conversation.body.id)}/messages`)
      .set('Authorization', bearer(client))
      .send({ body: 'Are you free tomorrow?' })
      .expect(201);

    const masterList = await request(app.server)
      .get('/api/v1/conversations')
      .set('Authorization', bearer(master))
      .expect(200);

    expect(masterList.body.items[0].unreadCount).toBe(1);
    expect(masterList.body.items[0].lastMessagePreview).toBe('Are you free tomorrow?');

    await request(app.server)
      .patch(`/api/v1/conversations/${String(conversation.body.id)}/read`)
      .set('Authorization', bearer(master))
      .expect(204);

    const afterRead = await request(app.server)
      .get('/api/v1/conversations')
      .set('Authorization', bearer(master))
      .expect(200);

    expect(afterRead.body.items[0].unreadCount).toBe(0);
  });

  it('rejects a message over the 4000-character cap with MESSAGE_TOO_LONG', async () => {
    const { client, master } = await seedBookedPair();

    const conversation = await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);

    await request(app.server)
      .post(`/api/v1/conversations/${String(conversation.body.id)}/messages`)
      .set('Authorization', bearer(client))
      .send({ body: 'a'.repeat(4001) })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('MESSAGE_TOO_LONG'));
  });

  it('DELETE /messages/:id is sender-side only — the recipient gets a 404', async () => {
    const { client, master } = await seedBookedPair();

    const conversation = await request(app.server)
      .post('/api/v1/conversations')
      .set('Authorization', bearer(client))
      .send({ participantId: master.id })
      .expect(201);

    const message = await request(app.server)
      .post(`/api/v1/conversations/${String(conversation.body.id)}/messages`)
      .set('Authorization', bearer(client))
      .send({ body: 'oops, wrong chat' })
      .expect(201);

    await request(app.server)
      .delete(`/api/v1/messages/${String(message.body.id)}`)
      .set('Authorization', bearer(master))
      .expect(404);

    await request(app.server)
      .delete(`/api/v1/messages/${String(message.body.id)}`)
      .set('Authorization', bearer(client))
      .expect(204);
  });

  describeAuthzMatrix(
    {
      method: 'get',
      describe: 'GET /conversations/:id/messages',
      context: async (testApp) => {
        const { client, master } = await seedBookedPair();
        const conversation = await request(testApp.server)
          .post('/api/v1/conversations')
          .set('Authorization', bearer(client))
          .send({ participantId: master.id })
          .expect(201);

        const stranger = await createClient(testApp);

        return {
          owner: client,
          stranger,
          path: `/api/v1/conversations/${String(conversation.body.id)}/messages`,
          foreignPath: `/api/v1/conversations/${String(conversation.body.id)}/messages`,
        };
      },
    },
    () => app,
  );

  describe('/chat Socket.io gateway', () => {
    let port: number;

    beforeAll(async () => {
      const httpServer = app.app.getHttpServer();

      // supertest binds the server to an ephemeral port itself the first time
      // `request(app.server)` is used, and every earlier `it` in this file already
      // did — a second `.listen()` on an already-listening server never fires its
      // callback, which hung this setup for the full test timeout the first time
      // this was written. Reuse that address; only listen if nothing has yet.
      if (!(httpServer.listening as boolean)) {
        await new Promise<void>((resolve) => {
          httpServer.listen(0, () => resolve());
        });
      }

      port = (httpServer.address() as AddressInfo).port;
    });

    const connect = (token?: string): Socket =>
      io(`http://127.0.0.1:${String(port)}/chat`, {
        ...(token !== undefined ? { auth: { token: `Bearer ${token}` } } : {}),
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });

    /**
     * Rejection happens in `handleConnection`, after the Engine.IO transport and
     * namespace connect — so the client always sees `connect` fire first, and the
     * proof of rejection is the server disconnecting it immediately afterwards, not
     * the absence of a `connect` event.
     */
    const expectHandshakeRejected = async (token?: string): Promise<void> => {
      const socket = connect(token);

      const disconnected = await new Promise<boolean>((resolve) => {
        socket.on('disconnect', () => resolve(true));
        setTimeout(() => resolve(false), 5000);
      });

      expect(disconnected).toBe(true);
      socket.close();
    };

    it('rejects a handshake with no token', async () => {
      await expectHandshakeRejected();
    });

    it('rejects a handshake with a malformed token', async () => {
      await expectHandshakeRejected('not-a-jwt');
    });

    it('delivers message:new to both participants and not to a third party', async () => {
      const { client, master } = await seedBookedPair();
      const stranger = await createClient(app);

      const conversation = await request(app.server)
        .post('/api/v1/conversations')
        .set('Authorization', bearer(client))
        .send({ participantId: master.id })
        .expect(201);

      const clientSocket = connect(client.accessToken);
      const masterSocket = connect(master.accessToken);
      const strangerSocket = connect(stranger.accessToken);

      await Promise.all(
        [clientSocket, masterSocket, strangerSocket].map(
          (socket) => new Promise<void>((resolve) => socket.on('connect', () => resolve())),
        ),
      );

      const masterReceived = new Promise<{ conversationId: string }>((resolve) => {
        masterSocket.on('message:new', (payload: { conversationId: string }) => resolve(payload));
      });

      let strangerReceived = false;
      strangerSocket.on('message:new', () => {
        strangerReceived = true;
      });

      await request(app.server)
        .post(`/api/v1/conversations/${String(conversation.body.id)}/messages`)
        .set('Authorization', bearer(client))
        .send({ body: 'hello from the client' })
        .expect(201);

      const received = await masterReceived;
      expect(received.conversationId).toBe(conversation.body.id);

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(strangerReceived).toBe(false);

      clientSocket.close();
      masterSocket.close();
      strangerSocket.close();
    });
  });
});
