import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';
import { IsTimeZone } from '@common/validators/is-time-zone.validator';

import { E164, RegisterBaseDto, trimValue } from './register-base.dto';

/**
 * FR-1.2. Phone and city are mandatory for masters, and the profile carries the public
 * fields a client sees in search.
 *
 * `categoryIds` is absent: `Category` does not exist until Phase 2 (F-05), and a
 * property the service could not honour would be a lie in the OpenAPI document.
 * Attaching categories at registration lands with that feature.
 */
export class RegisterMasterDto extends RegisterBaseDto {
  @ApiProperty({ example: '+998901234567', description: 'E.164 — required for masters' })
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format, for example +998901234567' })
  @MaxLength(20)
  @Transform(trimValue)
  phone!: string;

  @ApiProperty({ format: 'uuid', description: 'Required for masters' })
  @IsUUID('4')
  cityId!: string;

  @ApiProperty({ example: 'Aziz — Plumbing & Heating', minLength: 2, maxLength: 150 })
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  @Transform(trimValue)
  displayName!: string;

  @ApiProperty({ example: 'Asia/Tashkent', description: 'IANA time zone' })
  @IsString()
  @IsTimeZone()
  @Transform(trimValue)
  timezone!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimValue)
  bio?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 70, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsOfExperience?: number;
}
