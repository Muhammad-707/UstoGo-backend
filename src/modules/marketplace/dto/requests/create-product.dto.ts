import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateProductDto {
  @ApiProperty({ format: 'uuid', description: 'Must be an active ProductCategory.' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ minLength: 2, maxLength: 200, example: 'Portland Cement 50kg' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ minimum: 0.01, maximum: 99999999.99, example: 45 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  price!: number;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_PRODUCT_IMAGES,
    description: 'Direct image URLs, display order — the first is the cover photo.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsUrl({ require_protocol: true }, { each: true })
  imageUrls!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
