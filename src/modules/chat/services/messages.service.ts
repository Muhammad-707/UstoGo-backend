import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilePurpose, type Message, type MessageAttachment } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { ConversationsService } from './conversations.service';
import { CHAT } from '../constants/chat.constants';
import {
  decodeMessageCursor,
  encodeMessageCursor,
  type MessageCursor,
} from '../domain/message-cursor.util';
import type { SendMessageDto } from '../dto/requests/send-message.dto';
import type { AttachmentWithUrl } from '../dto/responses/message-attachment.response.dto';
import type { MessageWithAttachments } from '../dto/responses/message.response.dto';
import { CHAT_EVENT, MessageSentEvent, MessagesReadEvent } from '../events/chat.events';
import { MessageTooLongException } from '../exceptions/chat.exceptions';

const MESSAGE_INCLUDE = { attachments: { include: { file: true } } } as const;

type MessageWithFiles = Message & {
  attachments: (MessageAttachment & { file: { key: string } })[];
};

/** F-12 (MODULES.md › ChatModule). */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly conversations: ConversationsService,
    private readonly files: FilesService,
    private readonly events: EventEmitter2,
  ) {}

  async list(
    callerUserId: string,
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: MessageWithAttachments[]; nextCursor: string | null }> {
    await this.conversations.assertParticipant(conversationId, callerUserId);
    return this.fetchPage(conversationId, cursor, limit);
  }

  /** `GET /admin/conversations/:id/messages` — see `ConversationsService.findByIdForAdmin`. */
  async listForAdmin(
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: MessageWithAttachments[]; nextCursor: string | null }> {
    await this.conversations.findByIdForAdmin(conversationId);
    return this.fetchPage(conversationId, cursor, limit);
  }

  private async fetchPage(
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: MessageWithAttachments[]; nextCursor: string | null }> {
    const decoded = decodeMessageCursor(cursor);
    const rows = await this.prisma.db.message.findMany({
      where: { conversationId, ...this.cursorWhere(decoded) },
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    const items = await Promise.all(page.map((row) => this.withAttachmentUrls(row)));

    return {
      items,
      nextCursor:
        hasMore && last !== undefined
          ? encodeMessageCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** FR-10 — participant-only, capped at 4000 characters, attachments must already
   *  be the caller's own confirmed uploads. Updates the conversation summary in the
   *  same transaction and emits `MessageSentEvent` only after it commits. */
  async send(
    callerUserId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageWithAttachments> {
    const conversation = await this.conversations.assertParticipant(conversationId, callerUserId);

    if (dto.body.length > CHAT.MESSAGE_MAX_LENGTH) {
      throw new MessageTooLongException();
    }

    const attachmentFileIds = dto.attachmentKeys ?? [];
    for (const fileId of attachmentFileIds) {
      await this.files.getAttachable(fileId, callerUserId, FilePurpose.MESSAGE_ATTACHMENT);
    }

    const preview = dto.body.slice(0, CHAT.PREVIEW_MAX_LENGTH);

    const created = await this.transactionManager.run(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderUserId: callerUserId,
          body: dto.body,
          attachments: { create: attachmentFileIds.map((fileId) => ({ fileId })) },
        },
        include: MESSAGE_INCLUDE,
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: message.createdAt, lastMessagePreview: preview },
      });

      return message;
    });

    const recipientUserId =
      conversation.clientProfile.userId === callerUserId
        ? conversation.masterProfile.userId
        : conversation.clientProfile.userId;

    this.events.emit(
      CHAT_EVENT.MESSAGE_SENT,
      new MessageSentEvent(conversation.id, created.id, callerUserId, recipientUserId, preview),
    );

    return this.withAttachmentUrls(created);
  }

  /** `PATCH /conversations/:id/read` — every message not sent by the caller. */
  async markRead(callerUserId: string, conversationId: string): Promise<void> {
    await this.conversations.assertParticipant(conversationId, callerUserId);

    const unread = await this.prisma.db.message.findMany({
      where: { conversationId, senderUserId: { not: callerUserId }, readAt: null },
      select: { id: true },
    });

    if (unread.length === 0) {
      return;
    }

    const ids = unread.map((message) => message.id);

    await this.prisma.db.message.updateMany({
      where: { id: { in: ids } },
      data: { readAt: new Date() },
    });

    this.events.emit(
      CHAT_EVENT.MESSAGES_READ,
      new MessagesReadEvent(conversationId, callerUserId, ids),
    );
  }

  /** `DELETE /messages/:id` — sender-side soft delete only. The registry has no
   *  dedicated `MESSAGE_NOT_FOUND` code, so an unknown id or a message sent by
   *  someone else both surface as the generic `NOT_FOUND` (ERROR_HANDLING.md §4) —
   *  404 either way, per AUTHORIZATION.md §1. */
  async remove(callerUserId: string, messageId: string): Promise<void> {
    const result = await this.prisma.db.message.updateMany({
      where: { id: messageId, senderUserId: callerUserId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new ResourceNotFoundException(ERROR_CODE.NOT_FOUND, 'That message does not exist.');
    }
  }

  private cursorWhere(cursor: MessageCursor | undefined) {
    if (cursor === undefined) {
      return {};
    }

    const createdAt = new Date(cursor.createdAt);

    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
    };
  }

  private async withAttachmentUrls(message: MessageWithFiles): Promise<MessageWithAttachments> {
    const attachments: AttachmentWithUrl[] = await Promise.all(
      message.attachments.map(async (attachment) => ({
        id: attachment.id,
        fileId: attachment.fileId,
        url: await this.files.createReadUrlForKey(attachment.file.key),
      })),
    );

    return { ...message, attachments };
  }
}
