import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { ScheduleModule } from '@modules/schedule/schedule.module';

import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { BookingExportsController } from './controllers/booking-exports.controller';
import { BookingsController } from './controllers/bookings.controller';
import { CertificateVerificationController } from './controllers/certificate-verification.controller';
import { BookingsGateway } from './gateway/bookings.gateway';
import { AdminBookingTransitionService } from './services/admin-booking-transition.service';
import { BookingAttachmentsService } from './services/booking-attachments.service';
import { BookingCreationService } from './services/booking-creation.service';
import { BookingIcsExportService } from './services/booking-ics-export.service';
import { BookingJobsService } from './services/booking-jobs.service';
import { BookingPaymentService } from './services/booking-payment.service';
import { BookingReceiptService } from './services/booking-receipt.service';
import { BookingRescheduleService } from './services/booking-reschedule.service';
import { BookingStatsService } from './services/booking-stats.service';
import { BookingTransitionService } from './services/booking-transition.service';
import { BookingsService } from './services/bookings.service';
import { CompletionCertificateService } from './services/completion-certificate.service';
import { ScheduleOptimizerService } from './services/schedule-optimizer.service';

/**
 * F-09 (MODULES.md › BookingsModule). Imports `AuthModule` only for the JWT
 * verification `BookingsGateway` reuses for its socket handshake, the same reason
 * `ChatModule` imports it for `ChatGateway`.
 */
@Module({
  imports: [ScheduleModule, AuthModule, FilesModule],
  controllers: [
    BookingsController,
    BookingExportsController,
    CertificateVerificationController,
    AdminBookingsController,
  ],
  providers: [
    BookingsService,
    BookingCreationService,
    BookingTransitionService,
    BookingRescheduleService,
    BookingPaymentService,
    BookingAttachmentsService,
    BookingIcsExportService,
    BookingReceiptService,
    AdminBookingTransitionService,
    BookingJobsService,
    BookingStatsService,
    ScheduleOptimizerService,
    CompletionCertificateService,
    BookingsGateway,
  ],
  exports: [
    BookingsService,
    BookingCreationService,
    BookingTransitionService,
    BookingRescheduleService,
    BookingPaymentService,
    BookingAttachmentsService,
    BookingIcsExportService,
    BookingReceiptService,
    AdminBookingTransitionService,
    BookingJobsService,
    BookingStatsService,
    ScheduleOptimizerService,
    CompletionCertificateService,
  ],
})
export class BookingsModule {}
