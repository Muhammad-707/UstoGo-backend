import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  ReplyAlreadyExistsException,
  ReviewNotFoundException,
} from '../../exceptions/reviews.exceptions';
import { ReviewReplyService } from '../review-reply.service';

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    review?: Partial<Record<string, jest.Mock>>;
    reviewReply?: Partial<Record<string, jest.Mock>>;
    clientProfile?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1', displayName: 'Bob' }),
        ...overrides.masterProfile,
      },
      review: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'review-1', masterProfileId: 'mp-1', clientProfileId: 'cp-1' }),
        ...overrides.review,
      },
      reviewReply: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'reply-1', reviewId: 'review-1', body: 'Thanks!' }),
        ...overrides.reviewReply,
      },
      clientProfile: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'client-user-1' }),
        ...overrides.clientProfile,
      },
    },
  } as unknown as PrismaService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new ReviewReplyService(prisma, events), prisma, events };
};

describe('ReviewReplyService.reply', () => {
  it('throws ResourceNotFoundException when the caller has no master profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.reply('user-1', 'review-1', 'Thanks!')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ReviewNotFoundException when the review is not about the caller', async () => {
    const { service } = build({ review: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.reply('user-1', 'review-1', 'Thanks!')).rejects.toThrow(
      ReviewNotFoundException,
    );
  });

  it('throws ReplyAlreadyExistsException when the review already has a reply', async () => {
    const { service } = build({
      reviewReply: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
    });

    await expect(service.reply('user-1', 'review-1', 'Thanks!')).rejects.toThrow(
      ReplyAlreadyExistsException,
    );
  });

  it('creates the reply and emits ReviewRepliedEvent', async () => {
    const { service, events } = build();

    const reply = await service.reply('user-1', 'review-1', 'Thanks!');

    expect(reply.id).toBe('reply-1');
    expect(events.emit).toHaveBeenCalledWith('review.replied', expect.anything());
  });
});
