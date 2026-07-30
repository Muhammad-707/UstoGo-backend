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
});
