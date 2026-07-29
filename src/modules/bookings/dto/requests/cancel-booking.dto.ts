import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../../constants/booking.constants';

/**
 * `POST /bookings/:id/cancel` (FR-7.3). Optional here because only the master's
 * cancellation mandates one — `BookingTransitionService` enforces that asymmetry with
 * `422 REASON_REQUIRED`, since a DTO cannot vary its own rules by the caller's role.
 */
export class CancelBookingDto {
  @ApiPropertyOptional({ minLength: REASON_MIN_LENGTH, maxLength: REASON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(REASON_MIN_LENGTH, REASON_MAX_LENGTH)
  reason?: string;
}
