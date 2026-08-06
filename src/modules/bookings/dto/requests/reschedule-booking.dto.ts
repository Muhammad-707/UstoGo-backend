import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

/**
 * `POST /bookings/:id/reschedule` (B-51). `scheduledAt` is only format-validated
 * here — the 24h reschedule-window and 2-hour lead time are named domain codes
 * (`RESCHEDULE_WINDOW_CLOSED`, `SLOT_TOO_SOON`) checked in order by
 * `BookingsService`, following `CreateBookingDto`'s own precedent.
 */
export class RescheduleBookingDto {
  @ApiProperty({ example: '2026-08-10T09:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;
}
