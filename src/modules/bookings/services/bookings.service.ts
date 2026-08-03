import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { BookingStatusHistory, ClientProfile, MasterProfile, Service } from '@prisma/client';
import { ApprovalStatus, BookingStatus, Prisma, UserRole } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { zonedDateOf } from '@modules/schedule/domain/zoned-time';
import { AvailabilityService } from '@modules/schedule/services/availability.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  BOOKING_DETAIL_INCLUDE,
  BOOKING_LIST_INCLUDE,
  type BookingDetailRow,
} from './booking-includes';
import { MAX_OPEN_PENDING_BOOKINGS, MIN_LEAD_MINUTES } from '../constants/booking.constants';
import type { CreateBookingDto } from '../dto/requests/create-booking.dto';
import type { ListBookingsQueryDto } from '../dto/requests/list-bookings-query.dto';
import { BOOKING_EVENT, BookingCreatedEvent } from '../events/booking.events';
import {
  BookingNotFoundException,
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
 * F-09 creation and reads (MODULES.md › BookingsModule). Transitions live in
 * `BookingTransitionService` — this file only creates and reads.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly availability: AvailabilityService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateBookingDto): Promise<BookingDetailRow> {
    const validated = await this.validateCreation(userId, dto);
    const bookingNumber = await this.nextBookingNumber();

    const booking = await this.transactionManager.run(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingNumber,
          clientProfileId: validated.clientProfile.id,
          masterProfileId: dto.masterId,
          serviceId: dto.serviceId,
          status: BookingStatus.PENDING,
          scheduledAt: validated.scheduledAt,
          endsAt: validated.endsAt,
          durationMinutes: validated.service.durationMinutes,
          serviceTitle: validated.service.title,
          price: validated.service.price,
          priceType: validated.service.priceType,
          currency: validated.service.currency,
          ...bookingAddressData(dto),
          ...(dto.note !== undefined ? { clientNote: dto.note } : {}),
        },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: created.id,
          fromStatus: null,
          toStatus: BookingStatus.PENDING,
          actorType: 'CLIENT',
          actorUserId: userId,
        },
      });

      return created;
    });

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

    return booking;
  }

  async findById(id: string): Promise<BookingDetailRow> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });

    if (booking === null) {
      throw new BookingNotFoundException();
    }

    return booking;
  }

  async findHistory(bookingId: string): Promise<BookingStatusHistory[]> {
    return this.prisma.db.bookingStatusHistory.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * P0 — records the client's first click of the master's WhatsApp link. The analytics
   * signal is "did the client actually reach out", so only the first click is kept and
   * repeat clicks are no-ops. Non-participants get 404, never 403 (AUTHORIZATION.md §1).
   */
  async recordWhatsappClick(userId: string, bookingId: string): Promise<BookingDetailRow> {
    const booking = await this.findById(bookingId);

    if (booking.clientProfile.user.id !== userId) {
      throw new BookingNotFoundException();
    }

    if (booking.whatsappLinkClickedAt === null) {
      await this.prisma.db.booking.update({
        where: { id: bookingId },
        data: { whatsappLinkClickedAt: new Date() },
      });
    }

    return this.findById(bookingId);
  }

  /**
   * FR-7.6: participants and admins only — a non-participant gets `404`, never `403`,
   * so a foreign booking id cannot be confirmed to exist (AUTHORIZATION.md §1).
   */
  async getForCaller(
    caller: { id: string; role: UserRole },
    bookingId: string,
  ): Promise<{ booking: BookingDetailRow; history: BookingStatusHistory[] }> {
    const booking = await this.findById(bookingId);

    const isParticipant =
      caller.role === UserRole.ADMIN ||
      booking.masterProfile.user.id === caller.id ||
      booking.clientProfile.user.id === caller.id;

    if (!isParticipant) {
      throw new BookingNotFoundException();
    }

    const history = await this.findHistory(bookingId);

    return { booking, history };
  }

  async listForClient(
    userId: string,
    query: ListBookingsQueryDto,
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return this.list({ clientProfileId: clientProfile.id }, query);
  }

  async listForMaster(
    userId: string,
    query: ListBookingsQueryDto,
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    const masterProfile = await this.prisma.db.masterProfile.findUnique({ where: { userId } });
    if (masterProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }

    return this.list({ masterProfileId: masterProfile.id }, query);
  }

  async listForAdmin(
    query: ListBookingsQueryDto & { masterId?: string; clientId?: string },
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    return this.list(
      {
        ...(query.masterId !== undefined ? { masterProfileId: query.masterId } : {}),
        ...(query.clientId !== undefined ? { clientProfileId: query.clientId } : {}),
      },
      query,
    );
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

  private async list(
    scope: { clientProfileId?: string; masterProfileId?: string },
    query: ListBookingsQueryDto,
  ) {
    const where: Prisma.BookingWhereInput = {
      ...scope,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            scheduledAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.booking.findMany({
        where,
        include: BOOKING_LIST_INCLUDE,
        orderBy: { scheduledAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.booking.count({ where }),
    ]);

    return { items, total };
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
