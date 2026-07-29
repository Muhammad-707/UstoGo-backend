import { ApiPropertyOptional } from '@nestjs/swagger';
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

const E164 = /^\+[1-9]\d{7,14}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Fields only a client profile has. Rejected for a master (see `UsersService`). */
export const CLIENT_ONLY_FIELDS = ['defaultAddress'] as const;

/** Fields only a master profile has. */
export const MASTER_ONLY_FIELDS = [
  'displayName',
  'bio',
  'yearsOfExperience',
  'timezone',
  'serviceRadiusKm',
] as const;

/**
 * FR-3.2 — partial update of the caller's own profile.
 *
 * Email and role are absent by design: neither is updatable here. Email changes need
 * re-verification (Phase 6) and role is immutable (BR-2), so offering them as
 * silently-ignored properties would be worse than not offering them at all.
 *
 * Role-specific fields live on one DTO because there is one endpoint. Sending a
 * master-only field as a client is rejected rather than ignored — silent stripping is
 * the behaviour `forbidNonWhitelisted` exists to prevent, and it should not reappear
 * one layer down.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Aziz', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @IsSafeText()
  @Transform(trim)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Karimov', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @IsSafeText()
  @Transform(trim)
  lastName?: string;

  @ApiPropertyOptional({ example: '+998901234567', description: 'E.164' })
  @IsOptional()
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format, for example +998901234567' })
  @MaxLength(20)
  @Transform(trim)
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Client only' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  defaultAddress?: string;

  @ApiPropertyOptional({ maxLength: 150, description: 'Master only' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  @Transform(trim)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Master only' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  bio?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 70, description: 'Master only' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: 'Asia/Tashkent', description: 'Master only — IANA time zone' })
  @IsOptional()
  @IsString()
  @IsTimeZone()
  @Transform(trim)
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, description: 'Master only — kilometres' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  serviceRadiusKm?: number;
}
