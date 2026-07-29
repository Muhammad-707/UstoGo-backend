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
}
