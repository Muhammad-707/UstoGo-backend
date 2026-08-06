import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  MasterNotFoundException,
  QuickReplyLimitExceededException,
  QuickReplyNotFoundException,
} from '../../exceptions/masters.exceptions';
import { QuickRepliesService } from '../quick-replies.service';

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    quickReply?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        ...overrides.masterProfile,
      },
      quickReply: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'qr-1', text: 'Hi' }),
        update: jest.fn().mockResolvedValue({ id: 'qr-1', text: 'Updated' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'qr-1' }),
        ...overrides.quickReply,
      },
    },
  } as unknown as PrismaService;

  return { service: new QuickRepliesService(prisma), prisma };
};

describe('QuickRepliesService', () => {
  it('list throws MasterNotFoundException for a non-master caller', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.list('user-1')).rejects.toThrow(MasterNotFoundException);
  });

  it('create throws QuickReplyLimitExceededException at the cap', async () => {
    const { service } = build({ quickReply: { count: jest.fn().mockResolvedValue(20) } });

    await expect(service.create('user-1', { text: 'Hi' })).rejects.toThrow(
      QuickReplyLimitExceededException,
    );
  });

  it('create adds a reply scoped to the caller', async () => {
    const { service, prisma } = build();

    const reply = await service.create('user-1', { text: 'Hi' });

    expect(reply.id).toBe('qr-1');
    expect(prisma.db.quickReply.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ masterProfileId: 'mp-1' }) }),
    );
  });

  it('update throws QuickReplyNotFoundException for a foreign id', async () => {
    const { service } = build({ quickReply: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.update('user-1', 'qr-1', { text: 'x' })).rejects.toThrow(
      QuickReplyNotFoundException,
    );
  });

  it('remove soft-deletes scoped to the caller, idempotently', async () => {
    const { service, prisma } = build();

    await service.remove('user-1', 'qr-1');

    expect(prisma.db.quickReply.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ masterProfileId: 'mp-1' }) }),
    );
  });
});
