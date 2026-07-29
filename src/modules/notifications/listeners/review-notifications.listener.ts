import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

import {
  REVIEW_EVENT,
  type ReviewCreatedEvent,
  type ReviewRepliedEvent,
} from '@modules/reviews/events/review.events';

import { NotificationsService } from '../services/notifications.service';

/** FR-9.1: new review, review reply. */
@Injectable()
export class ReviewNotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(REVIEW_EVENT.CREATED)
  async onCreated(event: ReviewCreatedEvent): Promise<void> {
    await this.notifications.create(event.masterUserId, NotificationType.REVIEW_RECEIVED, {
      reviewId: event.reviewId,
      clientName: event.clientDisplayName,
      rating: event.rating,
    });
  }

  @OnEvent(REVIEW_EVENT.REPLIED)
  async onReplied(event: ReviewRepliedEvent): Promise<void> {
    await this.notifications.create(event.clientUserId, NotificationType.REVIEW_REPLIED, {
      reviewId: event.reviewId,
      masterName: event.masterDisplayName,
    });
  }
}
