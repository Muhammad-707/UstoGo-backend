import { ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsAfterFieldIfPresent } from '../../domain/is-after-field-if-present.validator';

/**
 * `PATCH /admin/banners/:id` (API.md §12, FR-11.2). Every field optional; the order
 * check on `startsAt`/`endsAt` applies to the pair as submitted in this request, the
 * same "if both given" rule `CreateBannerDto` enforces — it does not reconcile a
 * lone `endsAt` here against a `startsAt` already stored from a previous request.
 */
export class UpdateBannerDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  /** See `CreateBannerDto.imageKey`. */
  @ApiPropertyOptional({ format: 'uuid', description: "A confirmed File with purpose 'BANNER'." })
  @IsOptional()
  @IsUUID('4')
  imageKey?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkUrl?: string;

  @ApiPropertyOptional({ enum: BannerPosition })
  @IsOptional()
  @IsEnum(BannerPosition)
  position?: BannerPosition;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'ISO-8601.' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'ISO-8601.' })
  @IsOptional()
  @IsDateString()
  @IsAfterFieldIfPresent('startsAt')
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
