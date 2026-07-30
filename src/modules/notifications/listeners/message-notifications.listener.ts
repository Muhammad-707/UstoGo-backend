import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

import { CHAT_EVENT, type MessageSentEvent } from '@modules/chat/events/chat.events';

import { NotificationsService } from '../services/notifications.service';

/** FR-9.1: new message. */
@Injectable()
export class MessageNotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(CHAT_EVENT.MESSAGE_SENT)
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    await this.notifications.create(event.recipientUserId, NotificationType.MESSAGE_RECEIVED, {
      conversationId: event.conversationId,
      messageId: event.messageId,
      preview: event.bodyPreview,
    });
  }
}
