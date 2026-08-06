import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ClientProfile, MasterProfile, Service } from '@prisma/client';
import { ApprovalStatus, BookingStatus, Prisma } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { zonedDateOf } from '@modules/schedule/domain/zoned-time';
import { AvailabilityService } from '@modules/schedule/services/availability.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { BookingAttachmentsService } from './booking-attachments.service';
import { BOOKING_DETAIL_INCLUDE, type BookingDetailRow } from './booking-includes';
import {
  INSTANT_BOOK_MIN_SCORE,
  MAX_OPEN_PENDING_BOOKINGS,
  MIN_LEAD_MINUTES,
} from '../constants/booking.constants';
import type { CreateBookingDto } from '../dto/requests/create-booking.dto';
import { BOOKING_EVENT, BookingAcceptedEvent, BookingCreatedEvent } from '../events/booking.events';
import {
  ClientSlotConflictException,
  MasterUnavailableException,
  ServiceInvalidException,
  SlotNotAvailableException,
  SlotTooSoonException,
  TooManyPendingBookingsException,
} from '../exceptions/bookings.exceptions';

const OPEN_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
];

type ValidatedCreation = {
  clientProfile: ClientProfile;
  master: MasterProfile;
  service: Service;
  scheduledAt: Date;
  endsAt: Date;
};

/** Maps the address DTO onto the Booking row columns, skipping undefined fields. */
type BookingAddressData = {
  addressLine: string;
  addressDistrict: string;
  cityId: string;
  contactPhone?: string;
  latitude?: number;
  longitude?: number;
};

const bookingAddressData = (dto: CreateBookingDto): BookingAddressData => ({
  addressLine: dto.address.line,
  addressDistrict: dto.address.district,
  cityId: dto.address.cityId,
  ...(dto.address.contactPhone !== undefined ? { contactPhone: dto.address.contactPhone } : {}),
  ...(dto.address.latitude !== undefined ? { latitude: dto.address.latitude } : {}),
  ...(dto.address.longitude !== undefined ? { longitude: dto.address.longitude } : {}),
});

/**
 * FR-7.1 booking creation, including B-24 instant-book. Split out of `BookingsService`
 * (which keeps only reads) to stay under CODING_STANDARDS.md's 300-line file cap —
 * creation's six pre-conditions plus instant-book's branching earn their own file.
 */
@Injectable()
export class BookingCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly availability: AvailabilityService,
    private readonly attachments: BookingAttachmentsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateBookingDto): Promise<BookingDetailRow> {
    const validated = await this.validateCreation(userId, dto);
    const bookingNumber = await this.nextBookingNumber();
    const attachmentFileIds = await this.attachments.assertOwned(userId, dto.attachmentKeys);
    const isInstantBook = this.isEligibleForInstantBook(validated.master);

    const booking = await this.insertBooking({
      userId,
      dto,
      validated,
      bookingNumber,
      attachmentFileIds,
      isInstantBook,
    });

    this.emitCreationEvents(booking, isInstantBook);

    return booking;
  }

  /** B-15/B-24 — opted in AND a proven track record. */
  private isEligibleForInstantBook(master: MasterProfile): boolean {
    return (
      master.instantBookEnabled &&
      master.reliabilityScore !== null &&
      Number(master.reliabilityScore) >= INSTANT_BOOK_MIN_SCORE
    );
  }

  /**
   * The GiST exclusion constraint is still the real overlap guarantee for the
   * ACCEPTED row an instant-book inserts directly, exactly as it is for a normal
   * `accept()` (DATABASE.md §7.1) — no extra isolation ceremony needed here.
   */
  private async insertBooking(options: {
    userId: string;
    dto: CreateBookingDto;
    validated: ValidatedCreation;
    bookingNumber: string;
    attachmentFileIds: string[];
    isInstantBook: boolean;
  }): Promise<BookingDetailRow> {
    const { userId, dto, validated, bookingNumber, attachmentFileIds, isInstantBook } = options;
    const initialStatus = isInstantBook ? BookingStatus.ACCEPTED : BookingStatus.PENDING;

    return this.transactionManager.run(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingNumber,
          clientProfileId: validated.clientProfile.id,
          masterProfileId: dto.masterId,
          serviceId: dto.serviceId,
          status: initialStatus,
          ...(isInstantBook ? { acceptedAt: new Date() } : {}),
          scheduledAt: validated.scheduledAt,
          endsAt: validated.endsAt,
          durationMinutes: validated.service.durationMinutes,
          serviceTitle: validated.service.title,
          price: validated.service.price,
          priceType: validated.service.priceType,
          currency: validated.service.currency,
          ...bookingAddressData(dto),
          ...(dto.note !== undefined ? { clientNote: dto.note } : {}),
          attachments: { create: attachmentFileIds.map((fileId) => ({ fileId })) },
        },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: created.id,
          fromStatus: null,
          toStatus: initialStatus,
          actorType: isInstantBook ? 'SYSTEM' : 'CLIENT',
          actorUserId: userId,
          ...(isInstantBook ? { reason: 'Instant-book (B-24)' } : {}),
        },
      });

      return created;
    });
  }

  private emitCreationEvents(booking: BookingDetailRow, isInstantBook: boolean): void {
    this.events.emit(
      BOOKING_EVENT.CREATED,
      new BookingCreatedEvent(
        booking.id,
        booking.masterProfile.user.id,
        booking.clientProfile.firstName,
        booking.scheduledAt,
        booking.serviceTitle,
      ),
    );
    if (isInstantBook) {
      this.events.emit(
        BOOKING_EVENT.ACCEPTED,
        new BookingAcceptedEvent(
          booking.id,
          booking.clientProfile.user.id,
          booking.masterProfile.displayName,
          booking.scheduledAt,
        ),
      );
    }
  }

  /** FR-7.1 — the six pre-conditions, checked strictly in order so the first failure is the one reported. */
  private async validateCreation(
    userId: string,
    dto: CreateBookingDto,
  ): Promise<ValidatedCreation> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    // 1-3: master eligibility, service eligibility, lead time.
    const { master, service, scheduledAt, endsAt } = await this.assertMasterServiceAndTiming(dto);

    // 4-6: availability, client overlap, open-pending cap.
    await this.assertAvailabilityAndLimits({
      clientProfileId: clientProfile.id,
      dto,
      timezone: master.timezone,
      scheduledAt,
      endsAt,
    });

    return { clientProfile, master, service, scheduledAt, endsAt };
  }

  private async assertMasterServiceAndTiming(
    dto: CreateBookingDto,
  ): Promise<Pick<ValidatedCreation, 'master' | 'service' | 'scheduledAt' | 'endsAt'>> {
    // 1. Master exists, APPROVED, isActive, not deleted.
    const master = await this.prisma.db.masterProfile.findUnique({ where: { id: dto.masterId } });
    if (master === null) {
      throw new ResourceNotFoundException(
        ERROR_CODE.MASTER_NOT_FOUND,
        'That master does not exist.',
      );
    }
    if (master.approvalStatus !== ApprovalStatus.APPROVED || !master.isActive) {
      throw new MasterUnavailableException();
    }

    // 2. Service belongs to that master and is active.
    const service = await this.prisma.db.service.findFirst({
      where: { id: dto.serviceId, masterProfileId: dto.masterId, isActive: true },
    });
    if (service === null) {
      throw new ServiceInvalidException();
    }

    // 3. scheduledAt is >= 2 hours in the future.
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
      throw new SlotTooSoonException();
    }
    const endsAt = new Date(scheduledAt.getTime() + service.durationMinutes * 60_000);

    return { master, service, scheduledAt, endsAt };
  }

  private async assertAvailabilityAndLimits(options: {
    clientProfileId: string;
    dto: CreateBookingDto;
    timezone: string;
    scheduledAt: Date;
    endsAt: Date;
  }): Promise<void> {
    const { clientProfileId, dto, timezone, scheduledAt, endsAt } = options;

    // 4. Slot lies inside computed availability.
    const day = zonedDateOf(scheduledAt, timezone);
    const slots = await this.availability.compute(dto.masterId, day, day, dto.serviceId);
    if (!slots.some((slot) => slot.getTime() === scheduledAt.getTime())) {
      throw new SlotNotAvailableException();
    }

    // 5. The client has no other PENDING/ACCEPTED booking overlapping this window.
    const conflict = await this.prisma.db.booking.findFirst({
      where: {
        clientProfileId,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        scheduledAt: { lt: endsAt },
        endsAt: { gt: scheduledAt },
      },
    });
    if (conflict !== null) {
      throw new ClientSlotConflictException();
    }

    // 6. The client has fewer than 5 open PENDING bookings.
    const openCount = await this.prisma.db.booking.count({
      where: { clientProfileId, status: BookingStatus.PENDING },
    });
    if (openCount >= MAX_OPEN_PENDING_BOOKINGS) {
      throw new TooManyPendingBookingsException();
    }
  }

  private async nextBookingNumber(): Promise<string> {
    const [row] = await this.prisma.db.$queryRaw<{ nextval: bigint }[]>(
      Prisma.sql`SELECT nextval('booking_number_seq') AS nextval`,
    );
    const sequence = String(row?.nextval ?? 0n).padStart(6, '0');
    const year = new Date().getUTCFullYear();

    return `UG-${String(year)}-${sequence}`;
  }
}
