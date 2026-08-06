import type { PrismaService } from '@prisma-lib/prisma.service';

import type { BroadcastNotificationDto } from '../../dto/requests/broadcast-notification.dto';
import { NotificationsService } from '../notifications.service';

const build = (
  overrides: {
    notification?: Partial<Record<string, jest.Mock>>;
    notificationPreference?: Partial<Record<string, jest.Mock>>;
    user?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'n-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        ...overrides.notification,
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        ...overrides.notificationPreference,
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]),
        ...overrides.user,
      },
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), prisma };
};

describe('NotificationsService', () => {
  it('create writes a notification for the given user', async () => {
    const { service, prisma } = build();

    const notification = await service.create('user-1', 'BOOKING_CREATED', { bookingId: 'b-1' });

    expect(notification?.id).toBe('n-1');
    expect(prisma.db.notification.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'BOOKING_CREATED', payload: { bookingId: 'b-1' } },
    });
  });

  it('list scopes to the caller and applies the isRead filter when given', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'n-1' }]);
    const { service } = build({ notification: { findMany } });

    const result = await service.list('user-1', { page: 1, limit: 20, skip: 0, isRead: false });

    expect(result.items).toEqual([{ id: 'n-1' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
    );
  });

  it('list omits the isRead filter when not given', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ notification: { findMany } });

    await service.list('user-1', { page: 1, limit: 20, skip: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });

  it('unreadCount counts only the caller’s unread notifications', async () => {
    const count = jest.fn().mockResolvedValue(3);
    const { service } = build({ notification: { count } });

    const result = await service.unreadCount('user-1');

    expect(result).toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { userId: 'user-1', isRead: false } });
  });

  it('scopes markRead to the caller — a foreign id updates nothing', async () => {
    const { service, prisma } = build();

    await service.markRead('user-1', 'notif-1');

    expect(prisma.db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: 'user-1', isRead: false },
      data: expect.objectContaining({ isRead: true }),
    });
  });

  it('marks every unread notification read for the caller', async () => {
    const { service, prisma } = build();

    await service.markAllRead('user-1');

    expect(prisma.db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: expect.objectContaining({ isRead: true }),
    });
  });

  it('rejects broadcast when neither role nor userIds is provided', async () => {
    const { service } = build();
    const dto = { type: 'SYSTEM_ANNOUNCEMENT', payload: {} } as BroadcastNotificationDto;

    await expect(service.broadcast(dto)).rejects.toThrow();
  });

  it('rejects broadcast when both role and userIds are provided', async () => {
    const { service } = build();
    const dto = {
      role: 'CLIENT',
      userIds: ['u-1'],
      type: 'SYSTEM_ANNOUNCEMENT',
      payload: {},
    } as BroadcastNotificationDto;

    await expect(service.broadcast(dto)).rejects.toThrow();
  });

  it('broadcasts to every user with the given role', async () => {
    const { service, prisma } = build();
    const dto = {
      role: 'CLIENT',
      type: 'SYSTEM_ANNOUNCEMENT',
      payload: { text: 'hi' },
    } as BroadcastNotificationDto;

    const sent = await service.broadcast(dto);

    expect(prisma.db.user.findMany).toHaveBeenCalled();
    expect(sent).toBe(2);
  });

  it('broadcasts to an explicit list of user ids without querying by role', async () => {
    const { service, prisma } = build();
    const dto = {
      userIds: ['u-1', 'u-2'],
      type: 'SYSTEM_ANNOUNCEMENT',
      payload: {},
    } as BroadcastNotificationDto;

    await service.broadcast(dto);

    expect(prisma.db.user.findMany).not.toHaveBeenCalled();
    expect(prisma.db.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u-1', type: 'SYSTEM_ANNOUNCEMENT', payload: {} },
        { userId: 'u-2', type: 'SYSTEM_ANNOUNCEMENT', payload: {} },
      ],
    });
  });
});
