import { Injectable } from '@nestjs/common';
import type { QuickReply } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { QUICK_REPLY_LIMIT } from '../constants/masters.constants';
import type { CreateQuickReplyDto } from '../dto/requests/create-quick-reply.dto';
import type { UpdateQuickReplyDto } from '../dto/requests/update-quick-reply.dto';
import {
  MasterNotFoundException,
  QuickReplyLimitExceededException,
  QuickReplyNotFoundException,
} from '../exceptions/masters.exceptions';

/**
 * B-35 (MODULES.md › MastersModule). Split out of `MastersService` to keep it under
 * the 300-line file cap; follows `PortfolioImage`'s ownership pattern exactly. A
 * quick reply is used by copying `text` into a normal chat message — this service
 * only owns the CRUD for the list itself, never touches `ChatModule`.
 */
@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<QuickReply[]> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    return this.prisma.db.quickReply.findMany({
      where: { masterProfileId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateQuickReplyDto): Promise<QuickReply> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    const count = await this.prisma.db.quickReply.count({
      where: { masterProfileId, deletedAt: null },
    });
    if (count >= QUICK_REPLY_LIMIT) {
      throw new QuickReplyLimitExceededException();
    }

    return this.prisma.db.quickReply.create({
      data: { masterProfileId, text: dto.text, sortOrder: count },
    });
  }

  async update(userId: string, replyId: string, dto: UpdateQuickReplyDto): Promise<QuickReply> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    await this.assertOwned(masterProfileId, replyId);

    return this.prisma.db.quickReply.update({
      where: { id: replyId },
      data: { text: dto.text },
    });
  }

  /** Soft delete, idempotent — matches `removePortfolioImage`'s own precedent. */
  async remove(userId: string, replyId: string): Promise<void> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    await this.prisma.db.quickReply.updateMany({
      where: { id: replyId, masterProfileId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async assertOwned(masterProfileId: string, replyId: string): Promise<void> {
    const reply = await this.prisma.db.quickReply.findFirst({
      where: { id: replyId, masterProfileId, deletedAt: null },
      select: { id: true },
    });
    if (reply === null) {
      throw new QuickReplyNotFoundException();
    }
  }

  private async masterProfileIdFor(userId: string): Promise<string> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (master === null) {
      throw new MasterNotFoundException();
    }
    return master.id;
  }
}
