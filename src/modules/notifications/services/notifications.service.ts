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

  /**
   * Written by the event listeners; never called with another user's id.
   *
   * B-36 — a per-type preference row with `enabled = false` suppresses the write
   * entirely (absence of a row means "enabled", the default). Returns `null` in that
   * case; every listener already discards the return value, so this is additive.
   */
  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification | null> {
    const preference = await this.prisma.db.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
      select: { enabled: true },
    });
    if (preference?.enabled === false) {
      return null;
    }

    return this.prisma.db.notification.create({ data: { userId, type, payload } });
  }

  /** B-36 — every type, defaulting to enabled where the caller has no override row. */
  async listPreferences(userId: string): Promise<Record<NotificationType, boolean>> {
    const overrides = await this.prisma.db.notificationPreference.findMany({
      where: { userId },
      select: { type: true, enabled: true },
    });
    const overrideByType = new Map(overrides.map((row) => [row.type, row.enabled]));

    return Object.fromEntries(
      Object.values(NotificationType).map((type) => [type, overrideByType.get(type) ?? true]),
    ) as Record<NotificationType, boolean>;
  }

  /** Upserts one row per `(userId, type)` — idempotent, last write wins. */
  async updatePreferences(
    userId: string,
    preferences: { type: NotificationType; enabled: boolean }[],
  ): Promise<Record<NotificationType, boolean>> {
    await Promise.all(
      preferences.map((pref) =>
        this.prisma.db.notificationPreference.upsert({
          where: { userId_type: { userId, type: pref.type } },
          create: { userId, type: pref.type, enabled: pref.enabled },
          update: { enabled: pref.enabled },
        }),
      ),
    );

    return this.listPreferences(userId);
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
