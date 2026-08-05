import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export enum MasterSort {
  RATING_DESC = 'rating:desc',
  PRICE_ASC = 'price:asc',
  PRICE_DESC = 'price:desc',
  CREATED_DESC = 'createdAt:desc',
  DISTANCE_ASC = 'distance:asc',
}

/** API.md §7. */
export class MasterSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasCertificates?: boolean;

  @ApiPropertyOptional({ enum: MasterSort, default: MasterSort.RATING_DESC })
  @IsOptional()
  @IsEnum(MasterSort)
  sort?: MasterSort;

  @ApiPropertyOptional({ example: '2026-08-15', description: 'Masters with ≥1 free slot that day' })
  @IsOptional()
  @IsDateString({ strict: true })
  availableOn?: string;

  /**
   * §6.3 (MASTER_PROMPT.md): geo search against `City.latitude/longitude` (the
   * master's own precise coordinates are not collected — the city's are the only
   * ones this schema has). `lat`/`lng` alone add a `distance` field and enable
   * `sort=distance:asc`; adding `radiusKm` also filters to masters within
   * `LEAST(radiusKm, MasterProfile.serviceRadiusKm)` of the point.
   */
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 500,
    description: 'Only meaningful together with lat/lng.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  radiusKm?: number;
}
