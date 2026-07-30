import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { UsersService } from './users.service';
import type { DataExportResponseDto } from '../dto/responses/data-export.response.dto';
import { UserResponseDto } from '../dto/responses/user.response.dto';

const BOOKING_EXPORT_SELECT = {
  id: true,
  bookingNumber: true,
  status: true,
  scheduledAt: true,
  serviceTitle: true,
  price: true,
  createdAt: true,
} as const satisfies Prisma.BookingSelect;

const REVIEW_EXPORT_SELECT = {
  id: true,
  bookingId: true,
  rating: true,
  comment: true,
  createdAt: true,
} as const satisfies Prisma.ReviewSelect;

type ExportedBooking = Prisma.BookingGetPayload<{ select: typeof BOOKING_EXPORT_SELECT }>;
type ExportedReview = Prisma.ReviewGetPayload<{ select: typeof REVIEW_EXPORT_SELECT }>;

/**
 * `GET /users/me/export` (Phase 6, `BACKLOG.md` B-70's v1 scope). Everything the caller
 * is themselves the subject of: their own account/profile, bookings, reviews and
 * notifications — read directly rather than through each feature module's own service,
 * since this composes across modules the way `AdminModule`'s dashboard does
 * (`STATUS.md`'s F-15 entry) and none of them has a reason to depend back on this one.
 */
@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async export(userId: string, role: UserRole): Promise<DataExportResponseDto> {
    const user = await this.users.findMe(userId);
    const account = UserResponseDto.fromEntity(user);

    const [bookings, reviews, notifications] = await Promise.all([
      this.bookingsFor(userId, role),
      this.reviewsFor(userId, role),
      this.prisma.db.notification.findMany({
        where: { userId },
        select: { id: true, type: true, isRead: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      account,
      bookings: bookings.map((booking) => ({ ...booking, price: booking.price.toFixed(2) })),
      reviews,
      notifications,
      exportedAt: new Date(),
    };
  }

  private async bookingsFor(userId: string, role: UserRole): Promise<ExportedBooking[]> {
    const profileId = await this.profileIdFor(userId, role);
    if (profileId === null) {
      return [];
    }

    return this.prisma.db.booking.findMany({
      where:
        role === UserRole.MASTER ? { masterProfileId: profileId } : { clientProfileId: profileId },
      select: BOOKING_EXPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async reviewsFor(userId: string, role: UserRole): Promise<ExportedReview[]> {
    const profileId = await this.profileIdFor(userId, role);
    if (profileId === null) {
      return [];
    }

    return this.prisma.db.review.findMany({
      where:
        role === UserRole.MASTER ? { masterProfileId: profileId } : { clientProfileId: profileId },
      select: REVIEW_EXPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async profileIdFor(userId: string, role: UserRole): Promise<string | null> {
    if (role === UserRole.MASTER) {
      const profile = await this.prisma.db.masterProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      return profile?.id ?? null;
    }
    if (role === UserRole.CLIENT) {
      const profile = await this.prisma.db.clientProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      return profile?.id ?? null;
    }
    return null;
  }
}
