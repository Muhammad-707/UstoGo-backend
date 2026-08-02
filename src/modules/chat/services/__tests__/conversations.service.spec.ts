import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { NoSharedBookingException } from '../../exceptions/chat.exceptions';
import { ConversationsService } from '../conversations.service';

const CLIENT_PROFILE = { id: 'cp-1', userId: 'client-user-1', firstName: 'Alice', lastName: 'A.' };
const MASTER_PROFILE = { id: 'mp-1', userId: 'master-user-1', displayName: 'Bob the Builder' };

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    conversation?: Partial<Record<string, jest.Mock>>;
    message?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const conversationEntity = {
    id: 'conv-1',
    clientProfileId: CLIENT_PROFILE.id,
    masterProfileId: MASTER_PROFILE.id,
    clientProfile: CLIENT_PROFILE,
    masterProfile: MASTER_PROFILE,
    lastMessageAt: null,
    lastMessagePreview: null,
    createdAt: new Date(),
  };

  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue(CLIENT_PROFILE),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        ...overrides.masterProfile,
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: 'booking-1' }),
        ...overrides.booking,
      },
      conversation: {
        upsert: jest.fn().mockResolvedValue(conversationEntity),
        findFirst: jest.fn().mockResolvedValue(conversationEntity),
        findUnique: jest.fn().mockResolvedValue(conversationEntity),
        findMany: jest.fn().mockResolvedValue([conversationEntity]),
        count: jest.fn().mockResolvedValue(1),
        ...overrides.conversation,
      },
      message: {
        groupBy: jest.fn().mockResolvedValue([]),
        ...overrides.message,
      },
    },
  } as unknown as PrismaService;

  return { service: new ConversationsService(prisma), prisma, conversationEntity };
};

describe('ConversationsService.findOrCreate', () => {
  it('throws NoSharedBookingException when no non-expired booking links the pair', async () => {
    const { service } = build({
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.findOrCreate('client-user-1', 'master-user-1')).rejects.toThrow(
      NoSharedBookingException,
    );
  });

  it('checks bookings excluding only EXPIRED — the "non-expired" reading', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'booking-1' });
    const { service } = build({
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
      booking: { findFirst },
    });

    await service.findOrCreate('client-user-1', 'master-user-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'EXPIRED' } }) }),
    );
  });

  it('upserts on the (clientProfileId, masterProfileId) unique pair (BR-60)', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const { service } = build({
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
      conversation: { upsert },
    });

    await service.findOrCreate('client-user-1', 'master-user-1');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientProfileId_masterProfileId: {
            clientProfileId: CLIENT_PROFILE.id,
            masterProfileId: MASTER_PROFILE.id,
          },
        },
      }),
    );
  });

  it('throws ResourceNotFoundException when the participant has no complementary profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.findOrCreate('client-user-1', 'stranger')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('resolves the pair from the master side when the caller is a master', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const { service } = build({
      clientProfile: {
        findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'client-user-1' ? CLIENT_PROFILE : null),
        ),
      },
      masterProfile: {
        findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'master-user-1' ? MASTER_PROFILE : null),
        ),
      },
      conversation: { upsert },
    });

    await service.findOrCreate('master-user-1', 'client-user-1');

    expect(upsert).toHaveBeenCalled();
  });
});

describe('ConversationsService.assertParticipant', () => {
  it('throws CONVERSATION_NOT_FOUND when the caller is not a participant', async () => {
    const { service } = build({ conversation: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.assertParticipant('conv-1', 'stranger')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('returns the conversation for a participant', async () => {
    const { service, conversationEntity } = build();

    const result = await service.assertParticipant('conv-1', 'client-user-1');

    expect(result).toEqual(conversationEntity);
  });
});

describe('ConversationsService.findByIdForAdmin', () => {
  it('returns the conversation without participant scoping', async () => {
    const { service, conversationEntity } = build();

    const result = await service.findByIdForAdmin('conv-1');

    expect(result).toEqual(conversationEntity);
  });

  it('throws CONVERSATION_NOT_FOUND when the conversation does not exist', async () => {
    const { service } = build({
      conversation: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.findByIdForAdmin('ghost')).rejects.toThrow(ResourceNotFoundException);
  });
});

describe('ConversationsService.list', () => {
  it('scopes to the caller’s own conversations only', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({
      conversation: { findMany, count: jest.fn().mockResolvedValue(0) },
    });

    await service.list('client-user-1', 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ clientProfileId: CLIENT_PROFILE.id }] },
      }),
    );
  });

  it('scopes to the master side when the caller has no client profile', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
      conversation: { findMany, count: jest.fn().mockResolvedValue(0) },
    });

    await service.list('master-user-1', 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ masterProfileId: MASTER_PROFILE.id }] },
      }),
    );
  });

  it('reports unread_count for each returned conversation', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ conversationId: 'conv-1', _count: { _all: 3 } }]);
    const { service } = build({ message: { groupBy } });

    const { unreadByConversation } = await service.list('client-user-1', 1, 20);

    expect(unreadByConversation.get('conv-1')).toBe(3);
  });
});

describe('ConversationsService.unreadCount', () => {
  it('returns the unread count for a single conversation', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ conversationId: 'conv-1', _count: { _all: 2 } }]);
    const { service } = build({ message: { groupBy } });

    await expect(service.unreadCount('client-user-1', 'conv-1')).resolves.toBe(2);
  });

  it('returns zero when there is no unread history', async () => {
    const { service } = build({ message: { groupBy: jest.fn().mockResolvedValue([]) } });

    await expect(service.unreadCount('client-user-1', 'conv-1')).resolves.toBe(0);
  });
});

describe('ConversationsService.idsFor', () => {
  it('returns [] when the caller has neither profile', async () => {
    const { service } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      masterProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.idsFor('ghost')).resolves.toEqual([]);
  });

  it('returns conversation ids the caller participates in as a master', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'conv-1' }, { id: 'conv-2' }]);
    const { service } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
      conversation: { findMany },
    });

    await expect(service.idsFor('master-user-1')).resolves.toEqual(['conv-1', 'conv-2']);
  });

  it('returns conversation ids the caller participates in as a client', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'conv-1' }]);
    const { service } = build({ conversation: { findMany } });

    await expect(service.idsFor('client-user-1')).resolves.toEqual(['conv-1']);
  });
});

describe('ConversationsService.resolvePair (via findOrCreate)', () => {
  it('throws when a master-side participant has no client profile', async () => {
    const { service } = build({
      clientProfile: {
        findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
          Promise.resolve(where.userId === 'client-user-1' ? CLIENT_PROFILE : null),
        ),
      },
      masterProfile: { findUnique: jest.fn().mockResolvedValue(MASTER_PROFILE) },
    });

    await expect(service.findOrCreate('master-user-1', 'ghost')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws when the caller has no chat profile at all', async () => {
    const { service } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      masterProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.findOrCreate('ghost', 'master-user-1')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
});
