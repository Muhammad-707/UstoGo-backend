import { ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationReasonCode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../../constants/booking.constants';

/**
 * `POST /bookings/:id/cancel` (FR-7.3). `reason` (free text) is optional here because
 * only the master's cancellation mandates one — `BookingTransitionService` enforces
 * that asymmetry with `422 REASON_REQUIRED`, since a DTO cannot vary its own rules by
 * the caller's role. `reasonCode` is independently optional and additive — it exists
 * so the admin dashboard can bucket *why* bookings are cancelled, not just count them.
 */
export class CancelBookingDto {
  @ApiPropertyOptional({ minLength: REASON_MIN_LENGTH, maxLength: REASON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(REASON_MIN_LENGTH, REASON_MAX_LENGTH)
  reason?: string;

  @ApiPropertyOptional({ enum: CancellationReasonCode })
  @IsOptional()
  @IsEnum(CancellationReasonCode)
  reasonCode?: CancellationReasonCode;
}
