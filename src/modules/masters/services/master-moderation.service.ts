import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalStatus, type MasterProfile } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import {
  MASTER_MODERATION_EVENT,
  MasterActivatedEvent,
  MasterApprovedEvent,
  MasterDeactivatedEvent,
  MasterRejectedEvent,
} from '../events/master-moderation.events';
import {
  InvalidApprovalTransitionException,
  MasterNotFoundException,
  MasterNotReadyForApprovalException,
} from '../exceptions/masters.exceptions';

/** F-04 (MODULES.md › admin masters section). */
@Injectable()
export class MasterModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** BR-15: at least one category and one active service. */
  async approve(masterId: string, adminUserId: string): Promise<MasterProfile> {
    const master = await this.findOrThrow(masterId);

    if (master.approvalStatus !== ApprovalStatus.PENDING) {
      throw new InvalidApprovalTransitionException();
    }

    const [categoryCount, activeServiceCount] = await Promise.all([
      this.prisma.db.masterCategory.count({ where: { masterProfileId: masterId } }),
      this.prisma.db.service.count({ where: { masterProfileId: masterId, isActive: true } }),
    ]);

    if (categoryCount === 0) {
      throw new MasterNotReadyForApprovalException('The master has no attached category.');
    }
    if (activeServiceCount === 0) {
      throw new MasterNotReadyForApprovalException('The master has no active service.');
    }

    const updated = await this.prisma.db.masterProfile.update({
      where: { id: masterId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        approvedAt: new Date(),
        approvedByUserId: adminUserId,
      },
    });

    this.events.emit(MASTER_MODERATION_EVENT.APPROVED, new MasterApprovedEvent(masterId));

    return updated;
  }

  async reject(masterId: string, reason: string): Promise<MasterProfile> {
    const master = await this.findOrThrow(masterId);

    if (master.approvalStatus !== ApprovalStatus.PENDING) {
      throw new InvalidApprovalTransitionException();
    }

    const updated = await this.prisma.db.masterProfile.update({
      where: { id: masterId },
      data: { approvalStatus: ApprovalStatus.REJECTED, rejectionReason: reason },
    });

    this.events.emit(MASTER_MODERATION_EVENT.REJECTED, new MasterRejectedEvent(masterId, reason));

    return updated;
  }

  async activate(masterId: string): Promise<MasterProfile> {
    const master = await this.findOrThrow(masterId);

    if (master.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new InvalidApprovalTransitionException();
    }

    const updated = await this.prisma.db.masterProfile.update({
      where: { id: masterId },
      data: { isActive: true },
    });

    this.events.emit(MASTER_MODERATION_EVENT.ACTIVATED, new MasterActivatedEvent(masterId));

    return updated;
  }

  /**
   * Existing `ACCEPTED` bookings are not auto-cancelled (API.md §12) — that needs the
   * booking model (F-09, Phase 4), so the affected count this returns is always 0
   * until then rather than a number that looks meaningful and is not.
   */
  async deactivate(
    masterId: string,
    reason: string,
  ): Promise<{ master: MasterProfile; affectedBookings: number }> {
    const master = await this.findOrThrow(masterId);

    if (master.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new InvalidApprovalTransitionException();
    }

    const updated = await this.prisma.db.masterProfile.update({
      where: { id: masterId },
      data: { isActive: false },
    });

    this.events.emit(
      MASTER_MODERATION_EVENT.DEACTIVATED,
      new MasterDeactivatedEvent(masterId, reason),
    );

    return { master: updated, affectedBookings: 0 };
  }

  private async findOrThrow(masterId: string): Promise<MasterProfile> {
    const master = await this.prisma.db.masterProfile.findUnique({ where: { id: masterId } });

    if (master === null) {
      throw new MasterNotFoundException();
    }

    return master;
  }
}
