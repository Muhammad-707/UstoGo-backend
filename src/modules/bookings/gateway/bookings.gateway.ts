import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { Public } from '@common/decorators/public.decorator';
import type { JwtPayload } from '@common/types/jwt-payload.type';
import { AppConfigService } from '@config/app-config.service';
import { AUTH } from '@modules/auth/constants/auth.constants';
import { JwtStrategy } from '@modules/auth/strategies/jwt.strategy';

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
