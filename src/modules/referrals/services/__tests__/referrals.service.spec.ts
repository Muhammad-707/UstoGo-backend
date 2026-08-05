import { Prisma } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import { ReferralsService } from '../referrals.service';

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    referralReward?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const clientProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ referralCode: 'GENERATED1' }),
    ...overrides.clientProfile,
  };
  const referralRewardDelegate = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { bonusAmount: null }, _count: 0 }),
    ...overrides.referralReward,
  };
  const prisma = {
    db: { clientProfile: clientProfileDelegate, referralReward: referralRewardDelegate },
  } as unknown as PrismaService;

  return {
    service: new ReferralsService(prisma),
    clientProfileDelegate,
    referralRewardDelegate,
  };
};

describe('ReferralsService.resolveReferrer', () => {
  it('returns undefined for an undefined code without querying', async () => {
    const { service, clientProfileDelegate } = build();

    const result = await service.resolveReferrer(undefined);

    expect(result).toBeUndefined();
    expect(clientProfileDelegate.findUnique).not.toHaveBeenCalled();
  });

  it('returns undefined for a code that matches no one', async () => {
    const { service } = build({ clientProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.resolveReferrer('NOSUCHCODE')).resolves.toBeUndefined();
  });

  it("returns the referrer's client profile id for a known code", async () => {
    const { service, clientProfileDelegate } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'referrer-1' }) },
    });

    await expect(service.resolveReferrer('AZIZ4F2A')).resolves.toBe('referrer-1');
    expect(clientProfileDelegate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { referralCode: 'AZIZ4F2A' } }),
    );
  });
});

describe('ReferralsService.getMyReferral', () => {
  it('throws when the caller has no client profile', async () => {
    const { service } = build();

    await expect(service.getMyReferral('user-without-profile')).rejects.toThrow();
  });

  it('returns the existing code without regenerating one', async () => {
    const { service, clientProfileDelegate } = build({
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1', referralCode: 'EXISTING1' }),
      },
    });

    const result = await service.getMyReferral('user-1');

    expect(result.code).toBe('EXISTING1');
    expect(clientProfileDelegate.update).not.toHaveBeenCalled();
  });

  it('lazily generates and persists a code when the caller has none yet', async () => {
    const { service, clientProfileDelegate } = build({
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1', referralCode: null }),
        update: jest.fn().mockResolvedValue({ referralCode: 'FRESHCODE' }),
      },
    });

    const result = await service.getMyReferral('user-1');

    expect(result.code).toBe('FRESHCODE');
    expect(clientProfileDelegate.update).toHaveBeenCalledTimes(1);
  });

  it('retries code generation on a unique-constraint collision', async () => {
    const update = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ referralCode: 'SECONDTRY' });
    const { service } = build({
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1', referralCode: null }),
        update,
      },
    });

    const result = await service.getMyReferral('user-1');

    expect(result.code).toBe('SECONDTRY');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('sums reward totals for the caller as referrer', async () => {
    const { service } = build({
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp1', referralCode: 'CODE1' }),
        count: jest.fn().mockResolvedValue(3),
      },
      referralReward: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { bonusAmount: 10 }, _count: 2 }),
      },
    });

    const result = await service.getMyReferral('user-1');

    expect(result).toEqual({ code: 'CODE1', referredCount: 3, rewardCount: 2, totalBonus: 10 });
  });
});
