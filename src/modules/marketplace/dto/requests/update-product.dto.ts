import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_PRODUCT_IMAGES } from '../../constants/marketplace.constants';

/**
 * `PATCH /admin/products/:id`. Every field optional. `imageUrls`, when given, replaces
 * the full gallery atomically — there is no partial add/remove-one-image endpoint,
 * which would need a stable per-image id `ProductImage` intentionally does not expose.
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 99999999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  price?: number;

  @ApiPropertyOptional({ type: [String], minItems: 1, maxItems: MAX_PRODUCT_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsUrl({ require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
