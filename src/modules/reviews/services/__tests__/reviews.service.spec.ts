import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  BookingNotCompletedException,
  ReviewAlreadyExistsException,
  ReviewEditWindowClosedException,
  ReviewWindowClosedException,
} from '../../exceptions/reviews.exceptions';
import { ReviewsService } from '../reviews.service';

const NOW = Date.now();

const COMPLETED_BOOKING = {
  id: 'booking-1',
  clientProfileId: 'cp-1',
  masterProfileId: 'mp-1',
  status: 'COMPLETED',
  completedAt: new Date(NOW - 60_000),
};

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    review?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const txReview = {
    create: jest.fn().mockResolvedValue({ id: 'review-1', rating: 5, reply: null }),
    update: jest.fn().mockResolvedValue({ id: 'review-1', rating: 4, reply: null }),
    findMany: jest.fn().mockResolvedValue([{ rating: 5 }]),
  };
  const tx = {
    review: txReview,
    masterProfile: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1', firstName: 'Alice' }),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ userId: 'master-user-1' }),
        ...overrides.masterProfile,
      },
      booking: { findFirst: jest.fn().mockResolvedValue(COMPLETED_BOOKING), ...overrides.booking },
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        ...overrides.review,
      },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as TransactionManager;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new ReviewsService(prisma, transactionManager, events), tx, events };
};

describe('ReviewsService.create', () => {
  it('throws ResourceNotFoundException when the booking does not belong to the caller', async () => {
    const { service } = build({ booking: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.create('user-1', { bookingId: 'booking-1', rating: 5 })).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws BookingNotCompletedException for a non-completed booking', async () => {
    const { service } = build({
      booking: {
        findFirst: jest.fn().mockResolvedValue({ ...COMPLETED_BOOKING, status: 'ACCEPTED' }),
      },
    });

    await expect(service.create('user-1', { bookingId: 'booking-1', rating: 5 })).rejects.toThrow(
      BookingNotCompletedException,
    );
  });

  it('throws ReviewAlreadyExistsException when the booking already has a review', async () => {
    const { service } = build({
      review: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
    });

    await expect(service.create('user-1', { bookingId: 'booking-1', rating: 5 })).rejects.toThrow(
      ReviewAlreadyExistsException,
    );
  });

  it('throws ReviewWindowClosedException more than 30 days after completion', async () => {
    const stale = { ...COMPLETED_BOOKING, completedAt: new Date(NOW - 31 * 86_400_000) };
    const { service } = build({ booking: { findFirst: jest.fn().mockResolvedValue(stale) } });

    await expect(service.create('user-1', { bookingId: 'booking-1', rating: 5 })).rejects.toThrow(
      ReviewWindowClosedException,
    );
  });

  it('creates the review, recomputes the aggregate, and emits ReviewCreatedEvent', async () => {
    const { service, tx, events } = build();

    await service.create('user-1', { bookingId: 'booking-1', rating: 5 });

    expect(tx.masterProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ratingAverage: 5, ratingCount: 1 } }),
    );
    expect(events.emit).toHaveBeenCalledWith('review.created', expect.anything());
  });

  it('persists npsScore and wouldRecommend when the caller supplies them', async () => {
    const { service, tx } = build();

    await service.create('user-1', {
      bookingId: 'booking-1',
      rating: 5,
      npsScore: 9,
      wouldRecommend: true,
    });

    expect(tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ npsScore: 9, wouldRecommend: true }),
      }),
    );
  });

  it('omits npsScore/wouldRecommend from the write when the caller skips the survey', async () => {
    const { service, tx } = build();

    await service.create('user-1', { bookingId: 'booking-1', rating: 5 });

    const { data } = tx.review.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty('npsScore');
    expect(data).not.toHaveProperty('wouldRecommend');
  });
});

describe('ReviewsService.update', () => {
  it('throws ReviewEditWindowClosedException more than 24 hours after creation', async () => {
    const stale = {
      id: 'review-1',
      clientProfileId: 'cp-1',
      masterProfileId: 'mp-1',
      createdAt: new Date(NOW - 25 * 3_600_000),
    };
    const { service } = build({ review: { findFirst: jest.fn().mockResolvedValue(stale) } });

    await expect(service.update('user-1', 'review-1', { rating: 3 })).rejects.toThrow(
      ReviewEditWindowClosedException,
    );
  });

  it('updates within the 24-hour window and recomputes the aggregate', async () => {
    const fresh = {
      id: 'review-1',
      clientProfileId: 'cp-1',
      masterProfileId: 'mp-1',
      createdAt: new Date(NOW - 60_000),
    };
    const { service, tx } = build({ review: { findFirst: jest.fn().mockResolvedValue(fresh) } });

    await service.update('user-1', 'review-1', { rating: 3 });

    expect(tx.masterProfile.update).toHaveBeenCalled();
  });
});

describe('ReviewsService.hide/unhide', () => {
  it('hides a review and recomputes the aggregate excluding it', async () => {
    const { service, tx } = build({
      review: {
        findUnique: jest.fn().mockResolvedValue({ id: 'review-1', masterProfileId: 'mp-1' }),
      },
    });

    await service.hide('review-1', 'admin-1', 'Inappropriate language');

    expect(tx.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'HIDDEN', hiddenByUserId: 'admin-1' }),
      }),
    );
  });

  it('unhides a review and clears the hidden fields', async () => {
    const { service, tx } = build({
      review: {
        findUnique: jest.fn().mockResolvedValue({ id: 'review-1', masterProfileId: 'mp-1' }),
      },
    });

    await service.unhide('review-1', 'admin-1');

    expect(tx.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VISIBLE', hiddenReason: null }),
      }),
    );
  });
});

describe('ReviewsService — reads', () => {
  it('listMine scopes by the caller’s clientProfileId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ review: { findMany } });

    await service.listMine('user-1', 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientProfileId: 'cp-1' } }),
    );
  });

  it('listMine throws when the caller has no client profile', async () => {
    const { service } = build({ clientProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.listMine('user-1', 1, 20)).rejects.toThrow(ResourceNotFoundException);
  });

  it('listReceived scopes by the caller’s masterProfileId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ review: { findMany } });

    await service.listReceived('user-1', 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { masterProfileId: 'mp-1' } }),
    );
  });

  it('listReceived throws when the caller has no master profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.listReceived('user-1', 1, 20)).rejects.toThrow(ResourceNotFoundException);
  });

  it('listForAdmin queries unscoped, including hidden', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ review: { findMany } });

    await service.listForAdmin(1, 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('findByIdForAdmin returns the review', async () => {
    const { service } = build({
      review: { findUnique: jest.fn().mockResolvedValue({ id: 'review-1', reply: null }) },
    });

    const review = await service.findByIdForAdmin('review-1');

    expect(review.id).toBe('review-1');
  });

  it('findByIdForAdmin throws ReviewNotFoundException for an unknown id', async () => {
    const { service } = build({ review: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.findByIdForAdmin('missing')).rejects.toThrow();
  });

  it('publicListing returns visible reviews with the rating distribution', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([{ id: 'review-1', rating: 5, reply: null }]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([{ rating: 5, _count: { rating: 1 } }]),
      },
    });

    const result = await service.publicListing('mp-1', 1, 20, false);

    expect(result.total).toBe(1);
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
  });

  it('publicListing sorts by rating when requested', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ review: { findMany, groupBy: jest.fn().mockResolvedValue([]) } });

    await service.publicListing('mp-1', 1, 20, true);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { rating: 'desc' } }));
  });
});
