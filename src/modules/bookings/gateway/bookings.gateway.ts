import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { BookingStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';

import { Public } from '@common/decorators/public.decorator';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import type { JwtPayload } from '@common/types/jwt-payload.type';
import { AppConfigService } from '@config/app-config.service';
import { AUTH } from '@modules/auth/constants/auth.constants';
import { JwtStrategy } from '@modules/auth/strategies/jwt.strategy';
import { PrismaService } from '@prisma-lib/prisma.service';

import { userRoom } from './user-room.util';
import {
  BOOKING_EVENT,
  type BookingAcceptedEvent,
  type BookingCancelledEvent,
  type BookingCompletedEvent,
  type BookingCreatedEvent,
  type BookingRejectedEvent,
  type BookingStartedEvent,
} from '../events/booking.events';

type LocationPayload = { readonly bookingId: string; readonly lat: number; readonly lng: number };

// See ChatGateway's own comment: `Socket['data']` is untyped upstream, so `Omit`
// has to remove it before the typed replacement can stick.
type AuthenticatedSocket = Omit<Socket, 'data'> & { data: { user?: AuthenticatedUser } };

/**
 * `/bookings` namespace — a thin live-push layer over the booking lifecycle,
 * mirroring `ChatGateway`'s connect-time JWT handshake (same `JwtStrategy` reuse,
 * same reasoning: an expired/blocked account is rejected the same way a REST call
 * would be). Never creates or mutates a booking; `BookingTransitionService` is the
 * single writer and this only relays the events it emits after commit, the same
 * "read-only broadcast layer" contract `ChatGateway` documents for messages.
 *
 * One room per user (`userRoom`), not per booking — a client or master only ever
 * needs to hear about their own bookings, and unlike a chat conversation there is
 * no "other participant" who should NOT receive the event.
 */
@Public()
@WebSocketGateway({ namespace: '/bookings', cors: { origin: true, credentials: true } })
export class BookingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(BookingsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      if (token === undefined) {
        throw new Error('No bearer token in the handshake.');
      }

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.jwt.accessPublicKey,
        algorithms: ['RS256'],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        clockTolerance: AUTH.CLOCK_SKEW_SECONDS,
      });
      const user = await this.jwtStrategy.validate(payload);
      (socket as AuthenticatedSocket).data.user = user;

      await socket.join(userRoom(user.id));
    } catch (error) {
      this.logger.debug(`/bookings handshake rejected: ${(error as Error).message}`);
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Authentication required.' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Nothing to release — room membership lives on the socket itself.
  }

  @OnEvent(BOOKING_EVENT.CREATED)
  onCreated(event: BookingCreatedEvent): void {
    this.push(event.masterUserId, event.bookingId, 'PENDING');
  }

  @OnEvent(BOOKING_EVENT.ACCEPTED)
  onAccepted(event: BookingAcceptedEvent): void {
    this.push(event.clientUserId, event.bookingId, 'ACCEPTED');
  }

  @OnEvent(BOOKING_EVENT.REJECTED)
  onRejected(event: BookingRejectedEvent): void {
    this.push(event.clientUserId, event.bookingId, 'REJECTED');
  }

  @OnEvent(BOOKING_EVENT.STARTED)
  onStarted(event: BookingStartedEvent): void {
    this.push(event.clientUserId, event.bookingId, 'IN_PROGRESS');
  }

  @OnEvent(BOOKING_EVENT.COMPLETED)
  onCompleted(event: BookingCompletedEvent): void {
    this.push(event.clientUserId, event.bookingId, 'COMPLETED');
  }

  @OnEvent(BOOKING_EVENT.CANCELLED)
  onCancelled(event: BookingCancelledEvent): void {
    this.push(event.notifyUserId, event.bookingId, 'CANCELLED');
  }

  private push(userId: string, bookingId: string, status: string): void {
    this.server.to(userRoom(userId)).emit('booking:update', { bookingId, status });
  }

  /**
   * "On my way" live location. Ephemeral — never persisted, purely relayed — but
   * unlike `typing`, it fans out to a *different* user (the client), so it cannot
   * skip validation the way `typing` does: any connected socket could otherwise
   * spoof a location update to an arbitrary client by guessing a `bookingId`. The
   * booking must belong to the sending master and be `IN_PROGRESS` before anything
   * is relayed.
   */
  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = (socket as AuthenticatedSocket).data.user;
    const location = this.locationPayloadOf(payload);
    if (user === undefined || location === undefined) {
      return;
    }

    const clientUserId = await this.clientUserIdForActiveMasterBooking(user.id, location.bookingId);
    if (clientUserId === undefined) {
      return;
    }

    this.server.to(userRoom(clientUserId)).emit('location:update', {
      bookingId: location.bookingId,
      lat: location.lat,
      lng: location.lng,
      updatedAt: new Date().toISOString(),
    });
  }

  private async clientUserIdForActiveMasterBooking(
    masterUserId: string,
    bookingId: string,
  ): Promise<string | undefined> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        masterProfile: { select: { user: { select: { id: true } } } },
        clientProfile: { select: { user: { select: { id: true } } } },
      },
    });

    const owns = booking !== null && booking.masterProfile.user.id === masterUserId;
    if (!owns || booking.status !== BookingStatus.IN_PROGRESS) {
      return undefined;
    }

    return booking.clientProfile.user.id;
  }

  private locationPayloadOf(payload: unknown): LocationPayload | undefined {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('bookingId' in payload) ||
      !('lat' in payload) ||
      !('lng' in payload)
    ) {
      return undefined;
    }

    const candidate = payload as LocationPayload;
    if (
      typeof candidate.bookingId !== 'string' ||
      typeof candidate.lat !== 'number' ||
      typeof candidate.lng !== 'number'
    ) {
      return undefined;
    }

    return candidate;
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as Record<string, unknown>;
    const fromAuth = auth['token'];
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth.startsWith('Bearer ') ? fromAuth.slice('Bearer '.length) : fromAuth;
    }

    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    return undefined;
  }
}
