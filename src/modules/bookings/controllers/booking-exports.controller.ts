import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import { AppConfigService } from '@config/app-config.service';
import { ReadUrlResponseDto } from '@modules/files/dto/files.dto';

import { CompletionCertificateResponseDto } from '../dto/responses/completion-certificate.response.dto';
import { BookingAttachmentsService } from '../services/booking-attachments.service';
import { BookingIcsExportService } from '../services/booking-ics-export.service';
import { BookingReceiptService } from '../services/booking-receipt.service';
import { CompletionCertificateService } from '../services/completion-certificate.service';

const BOOKING_NOT_FOUND = { description: 'BOOKING_NOT_FOUND', type: ErrorResponseDto };

/**
 * Non-JSON booking exports (.ics/.pdf) and attachment URL resolution — split out of
 * `BookingsController` to keep it under CODING_STANDARDS.md's 300-line cap. Shares
 * the `bookings` prefix; every route here is 2+ segments, so it cannot collide with
 * `BookingsController`'s single-segment `GET /bookings/:id`, regardless of which
 * controller Nest scans first.
 */
@ApiTags('Bookings')
@Controller('bookings')
export class BookingExportsController {
  constructor(
    private readonly attachments: BookingAttachmentsService,
    private readonly icsExport: BookingIcsExportService,
    private readonly receipts: BookingReceiptService,
    private readonly certificates: CompletionCertificateService,
    private readonly config: AppConfigService,
  ) {}

  @Get('me/schedule.ics')
  @ApiAuth(UserRole.MASTER)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="schedule.ics"')
  @ApiProduces('text/calendar')
  @ApiOperation({
    summary: 'Export the caller’s upcoming work schedule as an .ics calendar file',
    description:
      'ACCEPTED/IN_PROGRESS bookings in the next 180 days. A one-time download, not ' +
      'a live subscription feed — re-download to refresh.',
  })
  async exportSchedule(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return this.icsExport.exportMasterSchedule(user.id);
  }

  @Get(':id/attachments/:fileId/url')
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({
    summary: "A short-lived read URL for one of the booking's attached photos",
    description:
      'B-54 — scoped by booking participancy, not upload ownership: the master can ' +
      'view a photo the client attached, unlike the uploader-only `GET /files/:id/url`.',
  })
  @ApiOkResponse({ type: ReadUrlResponseDto })
  @ApiNotFoundResponse({
    description: 'BOOKING_NOT_FOUND | FILE_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async getAttachmentUrl(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReadUrlResponseDto> {
    const url = await this.attachments.getUrl(user, id, fileId);
    return { url, expiresIn: this.config.storage.presignTtlSeconds };
  }

  @Get(':id/receipt.pdf')
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER, UserRole.ADMIN)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="receipt.pdf"')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download a PDF receipt for a completed booking' })
  @ApiNotFoundResponse(BOOKING_NOT_FOUND)
  @ApiConflictResponse({ description: 'BOOKING_NOT_COMPLETED', type: ErrorResponseDto })
  async receipt(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Buffer> {
    return this.receipts.generate(user, id);
  }

  @Get(':id/certificate')
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'The QR-verifiable completion certificate for a completed booking',
    description:
      'Issued automatically when the booking reaches COMPLETED. Rendering ' +
      '`verificationCode`/`verifyPath` as a QR image is a frontend concern.',
  })
  @ApiOkResponse({ type: CompletionCertificateResponseDto })
  @ApiNotFoundResponse({
    description: 'BOOKING_NOT_FOUND | COMPLETION_CERTIFICATE_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async certificate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CompletionCertificateResponseDto> {
    return this.certificates.getForBooking(user, id);
  }
}
