import { Prisma } from '@prisma/client';

import type { BookingCompletedEvent } from '@modules/bookings/events/booking.events';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { ReferralRewardListener } from '../referral-reward.listener';

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });

const EVENT: BookingCompletedEvent = {
  bookingId: 'booking-1',
  clientUserId: 'user-1',
  masterDisplayName: 'Aziz — Plumbing',
};

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    referralReward?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const clientProfileDelegate = {
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 'client-1', referredByClientProfileId: 'referrer-1' }),
    ...overrides.clientProfile,
  };
  const bookingDelegate = {
    count: jest.fn().mockResolvedValue(1),
    ...overrides.booking,
  };
  const referralRewardDelegate = {
    create: jest.fn().mockResolvedValue({}),
    ...overrides.referralReward,
  };
  const prisma = {
    db: {
      clientProfile: clientProfileDelegate,
      booking: bookingDelegate,
      referralReward: referralRewardDelegate,
    },
  } as unknown as PrismaService;

  return {
    listener: new ReferralRewardListener(prisma),
    clientProfileDelegate,
    bookingDelegate,
    referralRewardDelegate,
  };
};

describe('ReferralRewardListener.onBookingCompleted', () => {
  it('does nothing when the client has no profile', async () => {
    const { listener, referralRewardDelegate } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await listener.onBookingCompleted(EVENT);

    expect(referralRewardDelegate.create).not.toHaveBeenCalled();
  });

  it('does nothing when the client was not referred', async () => {
    const { listener, referralRewardDelegate } = build({
      clientProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'client-1', referredByClientProfileId: null }),
      },
    });

    await listener.onBookingCompleted(EVENT);

    expect(referralRewardDelegate.create).not.toHaveBeenCalled();
  });

  it('does nothing when this is not the first completed booking', async () => {
    const { listener, referralRewardDelegate } = build({
      booking: { count: jest.fn().mockResolvedValue(2) },
    });

    await listener.onBookingCompleted(EVENT);

    expect(referralRewardDelegate.create).not.toHaveBeenCalled();
  });

  it('creates the reward on the first completed booking of a referred client', async () => {
    const { listener, referralRewardDelegate } = build();

    await listener.onBookingCompleted(EVENT);

    expect(referralRewardDelegate.create).toHaveBeenCalledWith({
      data: {
        referrerClientProfileId: 'referrer-1',
        referredClientProfileId: 'client-1',
        triggerBookingId: 'booking-1',
      },
    });
  });

  it('swallows a unique-constraint race instead of throwing', async () => {
    const { listener } = build({
      referralReward: { create: jest.fn().mockRejectedValue(uniqueViolation()) },
    });

    await expect(listener.onBookingCompleted(EVENT)).resolves.toBeUndefined();
  });

  it('rethrows an unrelated database error', async () => {
    const { listener } = build({
      referralReward: { create: jest.fn().mockRejectedValue(new Error('connection lost')) },
    });

    await expect(listener.onBookingCompleted(EVENT)).rejects.toThrow('connection lost');
  });
});
