import type { EventEmitter2 } from '@nestjs/event-emitter';
import { FilePurpose } from '@prisma/client';

import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { FilesService } from '@modules/files/services/files.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { CHAT } from '../../constants/chat.constants';
import { MessageTooLongException } from '../../exceptions/chat.exceptions';
import type { ConversationsService } from '../conversations.service';
import { MessagesService } from '../messages.service';

const CONVERSATION = {
  id: 'conv-1',
  clientProfile: { userId: 'client-user-1' },
  masterProfile: { userId: 'master-user-1' },
};

const build = (
  overrides: {
    message?: Partial<Record<string, jest.Mock>>;
    txMessage?: Partial<Record<string, jest.Mock>>;
    conversationsService?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const createdMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderUserId: 'client-user-1',
    body: 'hello',
    readAt: null,
    createdAt: new Date(),
    attachments: [] as { id: string; fileId: string; file: { key: string } }[],
  };

  const txMessage = {
    create: jest.fn().mockResolvedValue(createdMessage),
    ...overrides.txMessage,
  };
  const tx = { message: txMessage, conversation: { update: jest.fn().mockResolvedValue({}) } };

  const prisma = {
    db: {
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        ...overrides.message,
      },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as TransactionManager;

  const conversations = {
    assertParticipant: jest.fn().mockResolvedValue(CONVERSATION),
    findByIdForAdmin: jest.fn().mockResolvedValue(CONVERSATION),
    ...overrides.conversationsService,
  } as unknown as ConversationsService;

  const files = {
    getAttachable: jest.fn().mockResolvedValue({ id: 'file-1', key: 'chat/file-1.png' }),
    createReadUrlForKey: jest.fn().mockResolvedValue('https://example.com/signed'),
  } as unknown as FilesService;

  const events = { emit: jest.fn() } as unknown as EventEmitter2;

  return {
    service: new MessagesService(prisma, transactionManager, conversations, files, events),
    prisma,
    tx,
    conversations,
    files,
    events,
    createdMessage,
  };
};

describe('MessagesService.send', () => {
  it('rejects a body over the 4000-character cap with MESSAGE_TOO_LONG', async () => {
    const { service } = build();
    const body = 'a'.repeat(CHAT.MESSAGE_MAX_LENGTH + 1);

    await expect(service.send('client-user-1', 'conv-1', { body })).rejects.toThrow(
      MessageTooLongException,
    );
  });

  it('checks attachment ownership through FilesService before creating the message', async () => {
    const { service, files } = build();

    await service.send('client-user-1', 'conv-1', { body: 'hi', attachmentKeys: ['file-1'] });

    expect(files.getAttachable).toHaveBeenCalledWith(
      'file-1',
      'client-user-1',
      FilePurpose.MESSAGE_ATTACHMENT,
    );
  });

  it('updates the conversation summary in the same transaction as the message', async () => {
    const { service, tx } = build();

    await service.send('client-user-1', 'conv-1', { body: 'hello there' });

    expect(tx.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({ lastMessagePreview: 'hello there' }),
      }),
    );
  });

  it('emits MessageSentEvent addressed to the other participant, after the transaction resolves', async () => {
    const { service, events } = build();

    await service.send('client-user-1', 'conv-1', { body: 'hello' });

    expect(events.emit).toHaveBeenCalledWith(
      'chat.message.sent',
      expect.objectContaining({ senderUserId: 'client-user-1', recipientUserId: 'master-user-1' }),
    );
  });

  it('propagates CONVERSATION_NOT_FOUND when the caller is not a participant', async () => {
    const { service } = build({
      conversationsService: {
        assertParticipant: jest.fn().mockRejectedValue(new ResourceNotFoundException()),
      },
    });

    await expect(service.send('stranger', 'conv-1', { body: 'hi' })).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
});

describe('MessagesService.markRead', () => {
  it('does nothing when there is nothing unread', async () => {
    const { service, prisma } = build({ message: { findMany: jest.fn().mockResolvedValue([]) } });

    await service.markRead('client-user-1', 'conv-1');

    expect(prisma.db.message.updateMany).not.toHaveBeenCalled();
  });

  it('marks only messages not sent by the caller as read', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const { service } = build({ message: { findMany, updateMany } });

    await service.markRead('client-user-1', 'conv-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-1', senderUserId: { not: 'client-user-1' }, readAt: null },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['m1', 'm2'] } } }),
    );
  });
});

describe('MessagesService.remove', () => {
  it('soft-deletes only when the caller is the sender', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service } = build({ message: { updateMany } });

    await service.remove('client-user-1', 'msg-1');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1', senderUserId: 'client-user-1', deletedAt: null },
      }),
    );
  });

  it('throws a 404 when the caller did not send the message', async () => {
    const { service } = build({
      message: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(service.remove('someone-else', 'msg-1')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
});
