import { Injectable } from '@nestjs/common';
import { FilePurpose, type UserRole } from '@prisma/client';

import { FileNotFoundException } from '@modules/files/exceptions/files.exceptions';
import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import { BOOKING_DETAIL_INCLUDE } from './booking-includes';
import { isBookingParticipant } from './booking-participant.util';
import { BookingNotFoundException } from '../exceptions/bookings.exceptions';

/**
 * B-54 (MODULES.md › BookingsModule). Split out of `BookingsService` to stay under
 * CODING_STANDARDS.md's 300-line file cap, and kept free of a `BookingsService`
 * dependency on purpose — `BookingsService.create` depends on this service for
 * `assertOwned`, so the reverse dependency would be circular. `getUrl` re-reads the
 * booking directly instead, sharing `isBookingParticipant` with
 * `BookingsService.getForCaller` rather than calling it.
 */
@Injectable()
export class BookingAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /**
   * Resolves each id to the caller's own confirmed `File` before the booking
   * transaction opens — the same ownership-scoped check chat attachments use
   * (`FilesService.getAttachable`, 404 for a foreign/unconfirmed/wrong-purpose id).
   */
  async assertOwned(userId: string, attachmentKeys: string[] | undefined): Promise<string[]> {
    const fileIds = attachmentKeys ?? [];
    for (const fileId of fileIds) {
      await this.files.getAttachable(fileId, userId, FilePurpose.BOOKING_ATTACHMENT);
    }
    return fileIds;
  }

  /**
   * A signed read URL for one of a booking's attached photos, scoped by booking
   * participancy (client/master/admin), not by upload ownership — the whole point is
   * that the *master* can view a photo the *client* uploaded. Mirrors
   * `MessagesService.withAttachmentUrls`'s use of `createReadUrlForKey`, which skips
   * the per-uploader check `GET /files/:id/url` enforces, since the caller already
   * passed a stronger check here.
   */
  async getUrl(
    caller: { id: string; role: UserRole },
    bookingId: string,
    fileId: string,
  ): Promise<string> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      include: BOOKING_DETAIL_INCLUDE,
    });
    if (booking === null || !isBookingParticipant(booking, caller)) {
      throw new BookingNotFoundException();
    }

    const attachment = booking.attachments.find((candidate) => candidate.fileId === fileId);
    if (attachment === undefined) {
      throw new FileNotFoundException();
    }

    return this.files.createReadUrlForKey(attachment.file.key);
  }
}
