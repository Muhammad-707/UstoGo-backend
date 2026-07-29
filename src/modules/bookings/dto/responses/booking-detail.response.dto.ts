import { ApiProperty } from '@nestjs/swagger';
import type { BookingStatusHistory, UserRole } from '@prisma/client';

import { BookingHistoryEntryResponseDto } from './booking-history.response.dto';
import { BookingResponseDto, type BookingWithParties } from './booking.response.dto';

/** `GET /bookings/:id` — detail plus the status history (FR-7.6, API.md §9). */
export class BookingDetailResponseDto extends BookingResponseDto {
  @ApiProperty({ type: BookingHistoryEntryResponseDto, isArray: true })
  history!: BookingHistoryEntryResponseDto[];

  static fromEntityWithHistory(
    booking: BookingWithParties,
    history: BookingStatusHistory[],
    viewerRole: UserRole,
  ): BookingDetailResponseDto {
    const base = BookingResponseDto.fromEntity(booking, viewerRole);
    const dto = Object.assign(new BookingDetailResponseDto(), base);

    dto.history = history.map((entry) => BookingHistoryEntryResponseDto.fromEntity(entry));

    return dto;
  }
}
