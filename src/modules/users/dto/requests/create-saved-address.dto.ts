import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
 * `POST /users/me/addresses` (B-50). Field names/validators mirror
 * `BookingAddressDto` exactly, plus a `label` and an `isDefault` flag neither the
 * booking flow nor `ClientProfile.defaultAddress` needed.
 */
export class CreateSavedAddressDto {
  @ApiProperty({ example: 'Home', maxLength: 50 })
  @IsString()
  @Length(1, 50)
  @IsSafeText()
  label!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  cityId!: string;

  @ApiProperty({ example: 'Rudaki Ave 12, apt 5' })
  @IsString()
  @Length(5, 500)
  @IsSafeText()
  line!: string;

  @ApiProperty({ example: 'Ismoili Somoni' })
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  district!: string;

  @ApiPropertyOptional({ example: '+992901234567' })
  @IsOptional()
  @Matches(/^\+?[0-9()\-\s]{7,20}$/)
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

  @ApiPropertyOptional({ default: false, description: 'Unsets any other default address.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
