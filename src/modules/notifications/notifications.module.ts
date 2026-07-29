import { Module } from '@nestjs/common';

import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { BookingNotificationsListener } from './listeners/booking-notifications.listener';
import { MasterNotificationsListener } from './listeners/master-notifications.listener';
import { ReviewNotificationsListener } from './listeners/review-notifications.listener';
import { NotificationsService } from './services/notifications.service';

/**
 * F-11 (MODULES.md › NotificationsModule). Depends on `PrismaModule` and its own event
 * listeners only — never imported by `BookingsModule`/`MastersModule`/`ReviewsModule`;
 * the dependency runs the other way, through events.
 */
@Module({
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    BookingNotificationsListener,
    MasterNotificationsListener,
    ReviewNotificationsListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
