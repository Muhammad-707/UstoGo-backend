import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from './user.response.dto';

/** One row of `GET /users/me/export`'s booking history. */
export class ExportedBookingDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty() scheduledAt!: Date;
  @ApiProperty() serviceTitle!: string;
  @ApiProperty() price!: string;
  @ApiProperty() createdAt!: Date;
}

/** One row of the caller's own reviews — written (client) or received (master). */
export class ExportedReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() rating!: number;
  @ApiProperty({ nullable: true }) comment!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class ExportedNotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: Date;
}

/**
 * `GET /users/me/export` (Phase 6, `BACKLOG.md` B-70's v1 scope: everything the caller
 * themself is the subject of, returned synchronously — not the full async/downloadable
 * self-service B-70 describes, which stays in the backlog).
 */
export class DataExportResponseDto {
  @ApiProperty({ type: UserResponseDto })
  account!: UserResponseDto;

  @ApiProperty({ type: [ExportedBookingDto] })
  bookings!: ExportedBookingDto[];

  @ApiProperty({ type: [ExportedReviewDto] })
  reviews!: ExportedReviewDto[];

  @ApiProperty({ type: [ExportedNotificationDto] })
  notifications!: ExportedNotificationDto[];

  @ApiProperty({ description: 'When this export was generated.' })
  exportedAt!: Date;
}
