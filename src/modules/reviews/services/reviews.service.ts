import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, ReviewStatus } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { REVIEW_EDIT_WINDOW_HOURS, REVIEW_WINDOW_DAYS } from '../constants/review.constants';
import { computeRatingAggregate } from '../domain/rating-aggregate';
import type { CreateReviewDto } from '../dto/requests/create-review.dto';
import type { UpdateReviewDto } from '../dto/requests/update-review.dto';
import type { ReviewWithReply } from '../dto/responses/review.response.dto';
import { REVIEW_EVENT, ReviewCreatedEvent } from '../events/review.events';
import {
  BookingNotCompletedException,
  ReviewAlreadyExistsException,
  ReviewEditWindowClosedException,
  ReviewNotFoundException,
  ReviewWindowClosedException,
} from '../exceptions/reviews.exceptions';

const REVIEW_INCLUDE = {
  reply: true,
  clientProfile: { select: { firstName: true, lastName: true } },
} as const;

/** F-10 (MODULES.md › ReviewsModule). Depends on `BookingsModule` for the gating check. */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly events: EventEmitter2,
  ) {}

  /** FR-8.1 — booking-gated, one review per booking, within 30 days of completion. */
  async create(userId: string, dto: CreateReviewDto): Promise<ReviewWithReply> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    const booking = await this.prisma.db.booking.findFirst({
      where: { id: dto.bookingId, clientProfileId: clientProfile.id },
    });
    if (booking === null) {
      throw new ResourceNotFoundException(
        ERROR_CODE.BOOKING_NOT_FOUND,
        'That booking does not exist.',
      );
    }
    if (booking.status !== BookingStatus.COMPLETED || booking.completedAt === null) {
      throw new BookingNotCompletedException();
    }

    const existing = await this.prisma.db.review.findUnique({ where: { bookingId: booking.id } });
    if (existing !== null) {
      throw new ReviewAlreadyExistsException();
    }

    const windowEnd = booking.completedAt.getTime() + REVIEW_WINDOW_DAYS * 86_400_000;
    if (Date.now() > windowEnd) {
      throw new ReviewWindowClosedException();
    }

    const review = await this.transactionManager.run(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          clientProfileId: clientProfile.id,
          masterProfileId: booking.masterProfileId,
          rating: dto.rating,
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
        include: REVIEW_INCLUDE,
      });

      await this.recomputeAggregate(tx, booking.masterProfileId);

      return created;
    });

    const master = await this.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: booking.masterProfileId },
      select: { userId: true },
    });

    this.events.emit(
      REVIEW_EVENT.CREATED,
      new ReviewCreatedEvent(review.id, master.userId, clientProfile.firstName, review.rating),
    );

    return review;
  }

  /** FR-8.2 — author only, within 24 hours of creation. */
  async update(userId: string, reviewId: string, dto: UpdateReviewDto): Promise<ReviewWithReply> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    const review = await this.prisma.db.review.findFirst({
      where: { id: reviewId, clientProfileId: clientProfile.id },
    });
    if (review === null) {
      throw new ReviewNotFoundException();
    }

    const editWindowEnd = review.createdAt.getTime() + REVIEW_EDIT_WINDOW_HOURS * 3_600_000;
    if (Date.now() > editWindowEnd) {
      throw new ReviewEditWindowClosedException();
    }

    return this.transactionManager.run(async (tx) => {
      const updated = await tx.review.update({
        where: { id: review.id },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          editedAt: new Date(),
        },
        include: REVIEW_INCLUDE,
      });

      await this.recomputeAggregate(tx, review.masterProfileId);

      return updated;
    });
  }

  async listMine(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: ReviewWithReply[]; total: number }> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return this.paginate({ clientProfileId: clientProfile.id }, page, limit);
  }

  async listReceived(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: ReviewWithReply[]; total: number }> {
    const masterProfile = await this.prisma.db.masterProfile.findUnique({ where: { userId } });
    if (masterProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }

    return this.paginate({ masterProfileId: masterProfile.id }, page, limit);
  }

  async listForAdmin(
    page: number,
    limit: number,
  ): Promise<{ items: ReviewWithReply[]; total: number }> {
    return this.paginate({}, page, limit);
  }

  async findByIdForAdmin(reviewId: string): Promise<ReviewWithReply> {
    const review = await this.prisma.db.review.findUnique({
      where: { id: reviewId },
      include: REVIEW_INCLUDE,
    });
    if (review === null) {
      throw new ReviewNotFoundException();
    }
    return review;
  }

  /** FR-8.4 — hidden reviews are excluded from public listings and from aggregates. */
  async hide(reviewId: string, adminUserId: string, reason: string): Promise<ReviewWithReply> {
    return this.setStatus(reviewId, ReviewStatus.HIDDEN, adminUserId, reason);
  }

  async unhide(reviewId: string, adminUserId: string): Promise<ReviewWithReply> {
    return this.setStatus(reviewId, ReviewStatus.VISIBLE, adminUserId);
  }

  /** FR-8.5 — visible reviews only, paginated, with the `{1..5: count}` distribution. */
  async publicListing(
    masterId: string,
    page: number,
    limit: number,
    sortByRating: boolean,
  ): Promise<{
    items: ReviewWithReply[];
    total: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  }> {
    const where = { masterProfileId: masterId, status: ReviewStatus.VISIBLE };

    const [items, total, distributionRows] = await Promise.all([
      this.prisma.db.review.findMany({
        where,
        include: REVIEW_INCLUDE,
        orderBy: sortByRating ? { rating: 'desc' } : { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.review.count({ where }),
      this.prisma.db.review.groupBy({ by: ['rating'], where, _count: { rating: true } }),
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distributionRows) {
      distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row._count.rating;
    }

    return { items, total, distribution };
  }

  private async setStatus(
    reviewId: string,
    status: ReviewStatus,
    adminUserId: string,
    reason?: string,
  ) {
    const review = await this.prisma.db.review.findUnique({ where: { id: reviewId } });
    if (review === null) {
      throw new ReviewNotFoundException();
    }

    return this.transactionManager.run(async (tx) => {
      const updated = await tx.review.update({
        where: { id: review.id },
        data:
          status === ReviewStatus.HIDDEN
            ? {
                status,
                hiddenReason: reason ?? null,
                hiddenByUserId: adminUserId,
                hiddenAt: new Date(),
              }
            : { status, hiddenReason: null, hiddenByUserId: null, hiddenAt: null },
        include: REVIEW_INCLUDE,
      });

      await this.recomputeAggregate(tx, review.masterProfileId);

      return updated;
    });
  }

  private async paginate(
    where: { clientProfileId?: string; masterProfileId?: string },
    page: number,
    limit: number,
  ) {
    const [items, total] = await Promise.all([
      this.prisma.db.review.findMany({
        where,
        include: REVIEW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.review.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * DATABASE.md §3.3's denormalisation contract: written only inside the transaction
   * that causes the change, recomputed from the current `VISIBLE` set every time
   * rather than incrementally — incremental updates would drift the moment a hide or
   * an edited rating touched a value the increment didn't account for.
   */
  private async recomputeAggregate(tx: PrismaTransaction, masterProfileId: string): Promise<void> {
    const visible = await tx.review.findMany({
      where: { masterProfileId, status: ReviewStatus.VISIBLE },
      select: { rating: true },
    });

    const { average, count } = computeRatingAggregate(visible.map((review) => review.rating));

    await tx.masterProfile.update({
      where: { id: masterProfileId },
      data: { ratingAverage: average, ratingCount: count },
    });
  }
}
