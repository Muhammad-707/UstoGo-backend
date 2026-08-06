import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

import { BookingAddressDto } from './booking-address.dto';

/** B-54: at most this many photos on a single booking request. */
export const MAX_BOOKING_ATTACHMENTS = 5;

/**
 * `POST /bookings` (FR-7.1). `scheduledAt` is only format-validated here
 * (`@IsDateString`) — the 2-hour lead time is `SLOT_TOO_SOON`, a named domain code
 * checked in order by `BookingsService`, not the generic `VALIDATION_FAILED` a
 * class-validator constraint would produce.
 */
export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  masterId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  serviceId!: string;

  @ApiProperty({ example: '2026-08-03T09:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ type: BookingAddressDto })
  @ValidateNested()
  @Type(() => BookingAddressDto)
  address!: BookingAddressDto;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsSafeText()
  note?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'B-54: up to 5 of the caller’s own confirmed File ids (photos of the problem), ' +
      'not raw storage keys — resolved ownership-scoped the same way chat attachments are.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BOOKING_ATTACHMENTS)
  @IsUUID('4', { each: true })
  attachmentKeys?: string[];
}
