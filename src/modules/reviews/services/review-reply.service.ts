import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ReviewReply } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { REVIEW_EVENT, ReviewRepliedEvent } from '../events/review.events';
import {
  ReplyAlreadyExistsException,
  ReviewNotFoundException,
} from '../exceptions/reviews.exceptions';

/** FR-8.3 — the reviewed master only, one reply per review. */
@Injectable()
export class ReviewReplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async reply(userId: string, reviewId: string, body: string): Promise<ReviewReply> {
    const masterProfile = await this.prisma.db.masterProfile.findUnique({ where: { userId } });
    if (masterProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }

    const review = await this.prisma.db.review.findFirst({
      where: { id: reviewId, masterProfileId: masterProfile.id },
    });
    if (review === null) {
      throw new ReviewNotFoundException();
    }

    const existing = await this.prisma.db.reviewReply.findUnique({
      where: { reviewId: review.id },
    });
    if (existing !== null) {
      throw new ReplyAlreadyExistsException();
    }

    const reply = await this.prisma.db.reviewReply.create({
      data: { reviewId: review.id, masterProfileId: masterProfile.id, body },
    });

    const client = await this.prisma.db.clientProfile.findUniqueOrThrow({
      where: { id: review.clientProfileId },
      select: { userId: true },
    });

    this.events.emit(
      REVIEW_EVENT.REPLIED,
      new ReviewRepliedEvent(review.id, client.userId, masterProfile.displayName),
    );

    return reply;
  }
}
