import { Module } from '@nestjs/common';

import { AdminReviewsController } from './controllers/admin-reviews.controller';
import { MasterReviewsController } from './controllers/master-reviews.controller';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewReplyService } from './services/review-reply.service';
import { ReviewsService } from './services/reviews.service';

/** F-10 (MODULES.md › ReviewsModule). */
@Module({
  controllers: [ReviewsController, AdminReviewsController, MasterReviewsController],
  providers: [ReviewsService, ReviewReplyService],
  exports: [ReviewsService, ReviewReplyService],
})
export class ReviewsModule {}
