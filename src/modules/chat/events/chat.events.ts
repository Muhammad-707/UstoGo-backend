/** Domain events (ARCHITECTURE.md §5) — emitted after commit, never inside. */
export const CHAT_EVENT = Object.freeze({
  MESSAGE_SENT: 'chat.message.sent',
  MESSAGES_READ: 'chat.messages.read',
} as const);

/**
 * Carries both participants' user ids so `NotificationsModule` can notify whichever
 * one did not send the message, and both `ConversationsService`'s own gateway
 * broadcast (`message:new`) and the notification listener can react to the one
 * event without either importing the other.
 */
export class MessageSentEvent {
  constructor(
    readonly conversationId: string,
    readonly messageId: string,
    readonly senderUserId: string,
    readonly recipientUserId: string,
    readonly bodyPreview: string,
  ) {}
}

/** Read receipts, broadcast to the gateway room only — not a notification trigger. */
export class MessagesReadEvent {
  constructor(
    readonly conversationId: string,
    readonly readerUserId: string,
    readonly messageIds: readonly string[],
  ) {}
}
