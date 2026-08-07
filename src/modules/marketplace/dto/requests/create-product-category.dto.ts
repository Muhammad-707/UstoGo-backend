import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

import { PRODUCT_CATEGORY_SLUG_PATTERN } from '../../constants/marketplace.constants';

export class CreateProductCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'Paint & Coatings' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ example: 'paint-coatings', description: 'Unique, immutable once created.' })
  @IsString()
  @Length(2, 120)
  @Matches(PRODUCT_CATEGORY_SLUG_PATTERN, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated',
  })
  slug!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
