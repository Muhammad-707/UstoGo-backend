import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, UserRole } from '@prisma/client';

import { AUTH_EVENT, type MasterRegisteredEvent } from '@modules/auth/events/auth.events';
import { PrismaService } from '@prisma-lib/prisma.service';

/**
 * FR-1.2 follow-up: a newly registered master lands in the moderation queue, and every
 * administrator needs to know about it. The auth module already emits
 * `master.registered` with the profile id; this listener resolves the details and
 * writes one notification per active admin (payload carries `title`/`message` so the
 * web client can render it without its own copy of the data).
 */
@Injectable()
export class AuthNotificationsListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(AUTH_EVENT.MASTER_REGISTERED)
  async onMasterRegistered(event: MasterRegisteredEvent): Promise<void> {
    const [admins, master] = await Promise.all([
      this.prisma.db.user.findMany({
        where: { role: UserRole.ADMIN, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.db.masterProfile.findUnique({
        where: { id: event.masterProfileId },
        select: {
          displayName: true,
          city: { select: { name: true } },
          categories: { select: { category: { select: { name: true } } } },
          user: { select: { email: true, phone: true } },
        },
      }),
    ]);

    if (admins.length === 0 || master === null) {
      return;
    }

    const payload: Record<string, unknown> = {
      masterProfileId: event.masterProfileId,
      masterName: master.displayName,
      email: master.user.email,
      phone: master.user.phone,
      cityName: master.city.name,
      categories: master.categories.map((entry) => entry.category.name),
      title: `New master registered: ${master.displayName}`,
      message: `${master.displayName} (${master.user.email}, ${master.city.name}) is waiting for approval in the moderation queue.`,
    };

    await this.prisma.db.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: NotificationType.MASTER_REGISTERED,
        payload,
      })),
    });
  }
}
