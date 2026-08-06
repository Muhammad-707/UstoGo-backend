import { ApiPropertyOptional } from '@nestjs/swagger';
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

/** `PATCH /users/me/addresses/:id` (B-50) — every field independently optional. */
export class UpdateSavedAddressDto {
  @ApiPropertyOptional({ example: 'Home', maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  @IsSafeText()
  label?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({ example: 'Rudaki Ave 12, apt 5' })
  @IsOptional()
  @IsString()
  @Length(5, 500)
  @IsSafeText()
  line?: string;

  @ApiPropertyOptional({ example: 'Ismoili Somoni' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  district?: string;

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

  @ApiPropertyOptional({ description: 'Unsets any other default address.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
