import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/**
 * The address step of the booking wizard. `district` is the district/jamoat the
 * client picks from the sub-divisions of their registered city; `line` is the
 * street/house composition. `cityId` is the client's registered city (reference,
 * kept so the booking resolves against the city even if the profile changes).
 * `contactPhone` is optional because the profile phone is a fallback — but at least
 * one of them must be reachable, so the master can always call the client.
 */
export class BookingAddressDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  cityId!: string;

  @ApiProperty({ minLength: 2, maxLength: 150 })
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  district!: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @Length(5, 500)
  @IsSafeText()
  line!: string;

  @ApiPropertyOptional({
    example: '+992900123456',
    description: 'Contact phone for this booking; falls back to the profile phone.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9()\-\s]{7,20}$/, {
    message: 'contactPhone must be a valid phone number',
  })
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
