import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

import {
  MASTER_MODERATION_EVENT,
  type MasterApprovedEvent,
  type MasterDeactivatedEvent,
  type MasterRejectedEvent,
} from '@modules/masters/events/master-moderation.events';
import { PrismaService } from '@prisma-lib/prisma.service';

import { NotificationsService } from '../services/notifications.service';

/**
 * FR-9.1: master approved/rejected/deactivated. `MastersModule` has emitted these
 * since Phase 2 with nothing listening — this is what actually needs them
 * (STATUS.md's note on the auth module's own unconsumed events, same pattern).
 */
@Injectable()
export class MasterNotificationsListener {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(MASTER_MODERATION_EVENT.APPROVED)
  async onApproved(event: MasterApprovedEvent): Promise<void> {
    const userId = await this.userIdFor(event.masterProfileId);
    if (userId === null) {
      return;
    }
    await this.notifications.create(userId, NotificationType.MASTER_APPROVED, {
      masterProfileId: event.masterProfileId,
    });
  }

  @OnEvent(MASTER_MODERATION_EVENT.REJECTED)
  async onRejected(event: MasterRejectedEvent): Promise<void> {
    const userId = await this.userIdFor(event.masterProfileId);
    if (userId === null) {
      return;
    }
    await this.notifications.create(userId, NotificationType.MASTER_REJECTED, {
      masterProfileId: event.masterProfileId,
      reason: event.reason,
    });
  }

  @OnEvent(MASTER_MODERATION_EVENT.DEACTIVATED)
  async onDeactivated(event: MasterDeactivatedEvent): Promise<void> {
    const userId = await this.userIdFor(event.masterProfileId);
    if (userId === null) {
      return;
    }
    await this.notifications.create(userId, NotificationType.MASTER_DEACTIVATED, {
      masterProfileId: event.masterProfileId,
      reason: event.reason,
    });
  }

  /** Events carry only the profile id (CLAUDE.md §9); the recipient is resolved here. */
  private async userIdFor(masterProfileId: string): Promise<string | null> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { id: masterProfileId },
      select: { userId: true },
    });

    return master?.userId ?? null;
  }
}
