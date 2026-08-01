import { MasterRegisteredEvent } from '@modules/auth/events/auth.events';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { AuthNotificationsListener } from '../auth-notifications.listener';

const build = (
  overrides: {
    user?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    notification?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
        ...overrides.user,
      },
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({
          displayName: 'Ali Ustoev',
          city: { name: 'Dushanbe' },
          categories: [{ category: { name: 'Plumbing Services' } }],
          user: { email: 'ali@ustogo.tj', phone: '+992900000001' },
        }),
        ...overrides.masterProfile,
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        ...overrides.notification,
      },
    },
  } as unknown as PrismaService;

  return { listener: new AuthNotificationsListener(prisma), prisma };
};

describe('AuthNotificationsListener', () => {
  it('notifies every admin when a master registers', async () => {
    const { listener, prisma } = build();

    await listener.onMasterRegistered(new MasterRegisteredEvent('user-1', 'profile-1'));

    expect(prisma.db.user.findMany).toHaveBeenCalledWith({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.db.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'admin-1',
          type: 'MASTER_REGISTERED',
          payload: expect.objectContaining({
            masterName: 'Ali Ustoev',
            email: 'ali@ustogo.tj',
            cityName: 'Dushanbe',
          }),
        }),
      ]),
    });
    expect((prisma.db.notification.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(2);
  });

  it('does nothing when there are no admins', async () => {
    const { listener, prisma } = build({
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await listener.onMasterRegistered(new MasterRegisteredEvent('user-1', 'profile-1'));

    expect(prisma.db.notification.createMany).not.toHaveBeenCalled();
  });

  it('does nothing when the master profile no longer exists', async () => {
    const { listener, prisma } = build({
      masterProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await listener.onMasterRegistered(new MasterRegisteredEvent('user-1', 'profile-1'));

    expect(prisma.db.notification.createMany).not.toHaveBeenCalled();
  });
});
