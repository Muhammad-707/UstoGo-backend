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
import type { Server, Socket } from 'socket.io';

import { Public } from '@common/decorators/public.decorator';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import type { JwtPayload } from '@common/types/jwt-payload.type';
import { AppConfigService } from '@config/app-config.service';
import { AUTH } from '@modules/auth/constants/auth.constants';
import { JwtStrategy } from '@modules/auth/strategies/jwt.strategy';

import { roomFor } from './conversation-room.util';
import { CHAT_EVENT, type MessageSentEvent, type MessagesReadEvent } from '../events/chat.events';
import { ConversationsService } from '../services/conversations.service';

type TypingPayload = { readonly conversationId: string };

// `Socket['data']` is typed `any` upstream, so a plain intersection (`Socket & {
// data: ... }`) collapses right back to `any` — TypeScript resolves `any & X` as
// `any`. `Omit` first removes the untyped member so the replacement actually sticks.
type AuthenticatedSocket = Omit<Socket, 'data'> & { data: { user?: AuthenticatedUser } };

/**
 * `/chat` namespace (ARCHITECTURE.md §7). Read-only broadcast layer on top of the
 * REST API — `FUNCTIONAL_REQUIREMENTS.md` §10 calls the REST contract "complete
 * without it" — so this gateway never creates a `Message`; `MessagesService.send`
 * is the single writer and this only relays the `MessageSentEvent`/`MessagesReadEvent`
 * it emits after commit. The one thing accepted directly over the socket is
 * `typing`, which is explicitly ephemeral and was never going to be persisted.
 */
// `JwtAuthGuard`/`RolesGuard` are registered globally over the HTTP `ExecutionContext`
// shape (AUTHORIZATION.md §2) and do not understand a websocket one — `@Public()`
// opts this gateway out of both, deliberately, because `handleConnection` below is
// this transport's own equivalent: every socket is authenticated once at connect
// time, the same way a REST request is authenticated once per call.
@Public()
@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly config: AppConfigService,
    private readonly conversations: ConversationsService,
  ) {}

  /**
   * JWT verified in the handshake (AUTHENTICATION.md §2), reusing `JwtStrategy` so
   * an expired, forged, or since-blocked-account token is rejected the same way it
   * would be on a REST request — including the re-read of the account's live
   * status, not just the token's claims.
   */
  async handleConnection(socket: Socket): Promise<void> {
    try {
      const user = await this.authenticate(socket);
      (socket as AuthenticatedSocket).data.user = user;

      const conversationIds = await this.conversations.idsFor(user.id);
      for (const id of conversationIds) {
        await socket.join(roomFor(id));
      }
    } catch (error) {
      this.logger.debug(`/chat handshake rejected: ${(error as Error).message}`);
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Authentication required.' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Nothing to release: room membership lives on the socket itself and Socket.io
    // tears it down on disconnect; there is no server-side session to clean up.
  }

  /** Ephemeral only — never written to `Message`, per DATABASE.md §9 and
   *  FEATURES.md's "REST send/read, functionally complete without WebSockets". */
  @SubscribeMessage('typing')
  handleTyping(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): void {
    const user = (socket as AuthenticatedSocket).data.user;
    const conversationId = this.conversationIdOf(payload);

    if (user === undefined || conversationId === undefined) {
      return;
    }

    socket.to(roomFor(conversationId)).emit('typing', { conversationId, userId: user.id });
  }

  @OnEvent(CHAT_EVENT.MESSAGE_SENT)
  onMessageSent(event: MessageSentEvent): void {
    this.server.to(roomFor(event.conversationId)).emit('message:new', {
      conversationId: event.conversationId,
      messageId: event.messageId,
      senderUserId: event.senderUserId,
      preview: event.bodyPreview,
    });
  }

  @OnEvent(CHAT_EVENT.MESSAGES_READ)
  onMessagesRead(event: MessagesReadEvent): void {
    this.server.to(roomFor(event.conversationId)).emit('message:read', {
      conversationId: event.conversationId,
      readerUserId: event.readerUserId,
      messageIds: event.messageIds,
    });
  }

  private async authenticate(socket: Socket): Promise<AuthenticatedUser> {
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

    return this.jwtStrategy.validate(payload);
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

  private conversationIdOf(payload: unknown): string | undefined {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'conversationId' in payload &&
      typeof (payload as TypingPayload).conversationId === 'string'
    ) {
      return (payload as TypingPayload).conversationId;
    }

    return undefined;
  }
}
