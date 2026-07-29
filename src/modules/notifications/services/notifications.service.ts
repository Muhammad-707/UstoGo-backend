import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { NotificationType, Prisma, UserRole } from '@prisma/client';

import { BadRequestException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { BroadcastNotificationDto } from '../dto/requests/broadcast-notification.dto';
import type { NotificationsQueryDto } from '../dto/requests/notifications-query.dto';

/**
 * F-11 (MODULES.md › NotificationsModule). Depends only on `PrismaModule` and its own
 * event listeners — never imported by `BookingsModule` or any other feature module; the
 * dependency runs the other way, through events (`NOTIFICATION_LISTENERS` in this
 * module subscribes to `BOOKING_EVENT` etc.).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Written by the event listeners; never called with another user's id. */
  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification> {
    return this.prisma.db.notification.create({ data: { userId, type, payload } });
  }

  async list(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<{ items: Notification[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.notification.count({ where }),
    ]);

    return { items, total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.db.notification.count({ where: { userId, isRead: false } });
  }

  /** Scoped by `userId` in the `WHERE`, not just the id — a foreign id silently matches nothing (AUTHORIZATION.md: no override). */
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /** `POST /admin/notifications/broadcast` — exactly one of `role`/`userIds`. */
  async broadcast(dto: BroadcastNotificationDto): Promise<number> {
    if ((dto.role === undefined) === (dto.userIds === undefined)) {
      throw new BadRequestException(undefined, 'Provide exactly one of `role` or `userIds`.');
    }

    const targetIds =
      dto.userIds ??
      (
        await this.prisma.db.user.findMany({
          where: { role: dto.role as UserRole, deletedAt: null },
          select: { id: true },
        })
      ).map((user) => user.id);

    if (targetIds.length === 0) {
      return 0;
    }

    const { count } = await this.prisma.db.notification.createMany({
      data: targetIds.map((userId) => ({ userId, type: dto.type, payload: dto.payload })),
    });

    return count;
  }
}
