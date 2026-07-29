import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

import { BookingAddressDto } from './booking-address.dto';

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
}
