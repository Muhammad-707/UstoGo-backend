import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { clientProfileFor, masterProfileFor } from './profile-lookup.util';
import type { ConversationWithParticipants } from '../dto/responses/conversation.response.dto';
import { NoSharedBookingException } from '../exceptions/chat.exceptions';

const PARTICIPANTS_INCLUDE = {
  clientProfile: { select: { userId: true, firstName: true, lastName: true } },
  masterProfile: { select: { userId: true, displayName: true } },
} as const;

type ProfilePair = { clientProfileId: string; masterProfileId: string };

/** F-12 (MODULES.md › ChatModule). */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /conversations` — find-or-create on the unique `(clientProfileId,
   * masterProfileId)` pair (BR-60).
   *
   * @throws {NoSharedBookingException} when no booking between the two has ever
   *   existed in a status other than `EXPIRED`. "Non-expired" is read narrowly here:
   *   a `PENDING` booking that later expired should not, by itself, be able to open a
   *   conversation the client never earned by actually engaging the master, but every
   *   other status — including `REJECTED` and every `CANCELLED_*` — reflects a real
   *   booking the two parties already negotiated, and closing chat off from a
   *   cancelled booking would block exactly the "can we reschedule?" conversation
   *   that status exists to have. Documented in `STATUS.md`.
   */
  async findOrCreate(
    callerUserId: string,
    participantUserId: string,
  ): Promise<ConversationWithParticipants> {
    const { clientProfileId, masterProfileId } = await this.resolvePair(
      callerUserId,
      participantUserId,
    );

    const booking = await this.prisma.db.booking.findFirst({
      where: {
        clientProfileId,
        masterProfileId,
        status: { not: BookingStatus.EXPIRED },
      },
      select: { id: true },
    });

    if (booking === null) {
      throw new NoSharedBookingException();
    }

    return this.prisma.db.conversation.upsert({
      where: { clientProfileId_masterProfileId: { clientProfileId, masterProfileId } },
      update: {},
      create: { clientProfileId, masterProfileId },
      include: PARTICIPANTS_INCLUDE,
    });
  }

  async list(
    callerUserId: string,
    page: number,
    limit: number,
  ): Promise<{
    items: ConversationWithParticipants[];
    total: number;
    unreadByConversation: Map<string, number>;
  }> {
    const [client, master] = await Promise.all([
      clientProfileFor(this.prisma, callerUserId),
      masterProfileFor(this.prisma, callerUserId),
    ]);

    const where = {
      OR: [
        ...(client !== null ? [{ clientProfileId: client.id }] : []),
        ...(master !== null ? [{ masterProfileId: master.id }] : []),
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.db.conversation.findMany({
        where,
        include: PARTICIPANTS_INCLUDE,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.conversation.count({ where }),
    ]);

    const unreadByConversation = await this.unreadCounts(
      callerUserId,
      items.map((item) => item.id),
    );

    return { items, total, unreadByConversation };
  }

  /**
   * `GET /admin/conversations/:id/messages` — USER_ROLES.md: admin chat access is a
   * dispute-resolution capability, not a browsing one, so unlike every other lookup
   * here this does not scope to a participant. `@Audit(CONVERSATION_ACCESSED, ...)`
   * on the controller route is what makes that trail exist (AUTHORIZATION.md §6).
   */
  async findByIdForAdmin(conversationId: string): Promise<ConversationWithParticipants> {
    const conversation = await this.prisma.db.conversation.findUnique({
      where: { id: conversationId },
      include: PARTICIPANTS_INCLUDE,
    });

    if (conversation === null) {
      throw new ResourceNotFoundException(
        ERROR_CODE.CONVERSATION_NOT_FOUND,
        'That conversation does not exist.',
      );
    }

    return conversation;
  }

  /**
   * @throws {ResourceNotFoundException} `CONVERSATION_NOT_FOUND` when the caller is
   *   not a participant — including when the id does not exist at all. The two cases
   *   are indistinguishable on purpose (AUTHORIZATION.md §1).
   */
  async assertParticipant(
    conversationId: string,
    callerUserId: string,
  ): Promise<ConversationWithParticipants> {
    const conversation = await this.prisma.db.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { clientProfile: { userId: callerUserId } },
          { masterProfile: { userId: callerUserId } },
        ],
      },
      include: PARTICIPANTS_INCLUDE,
    });

    if (conversation === null) {
      throw new ResourceNotFoundException(
        ERROR_CODE.CONVERSATION_NOT_FOUND,
        'That conversation does not exist.',
      );
    }

    return conversation;
  }

  /** Every conversation id the caller participates in — used by the gateway to join
   *  the caller's rooms on connect. */
  async idsFor(callerUserId: string): Promise<string[]> {
    const [client, master] = await Promise.all([
      clientProfileFor(this.prisma, callerUserId),
      masterProfileFor(this.prisma, callerUserId),
    ]);

    if (client === null && master === null) {
      return [];
    }

    const conversations = await this.prisma.db.conversation.findMany({
      where: {
        OR: [
          ...(client !== null ? [{ clientProfileId: client.id }] : []),
          ...(master !== null ? [{ masterProfileId: master.id }] : []),
        ],
      },
      select: { id: true },
    });

    return conversations.map((conversation) => conversation.id);
  }

  private async unreadCounts(
    callerUserId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.db.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversationIds },
        senderUserId: { not: callerUserId },
        readAt: null,
      },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.conversationId, row._count._all]));
  }

  /** Single-conversation form of {@link unreadCounts}, for `POST /conversations`'s
   *  response when the conversation already existed and has unread history. */
  async unreadCount(callerUserId: string, conversationId: string): Promise<number> {
    const counts = await this.unreadCounts(callerUserId, [conversationId]);
    return counts.get(conversationId) ?? 0;
  }

  private async resolvePair(callerUserId: string, participantUserId: string): Promise<ProfilePair> {
    const [callerClient, callerMaster] = await Promise.all([
      clientProfileFor(this.prisma, callerUserId),
      masterProfileFor(this.prisma, callerUserId),
    ]);

    if (callerClient !== null) {
      const participant = await masterProfileFor(this.prisma, participantUserId);
      if (participant === null) {
        throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master not found.');
      }
      return { clientProfileId: callerClient.id, masterProfileId: participant.id };
    }

    if (callerMaster !== null) {
      const participant = await clientProfileFor(this.prisma, participantUserId);
      if (participant === null) {
        throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client not found.');
      }
      return { clientProfileId: participant.id, masterProfileId: callerMaster.id };
    }

    throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Caller has no chat profile.');
  }
}
