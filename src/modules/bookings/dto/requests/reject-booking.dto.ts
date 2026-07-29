import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../../constants/booking.constants';

/** `POST /bookings/:id/reject` (FR-7.3) — reason is mandatory for every rejection. */
export class RejectBookingDto {
  @ApiProperty({ minLength: REASON_MIN_LENGTH, maxLength: REASON_MAX_LENGTH })
  @IsString()
  @Length(REASON_MIN_LENGTH, REASON_MAX_LENGTH)
  reason!: string;
}
