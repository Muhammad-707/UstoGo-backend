import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsMultipleOf } from '@common/validators/is-multiple-of.validator';

export class CreateServiceDto {
  @ApiProperty({ format: 'uuid', description: 'Must be a leaf category attached to the caller.' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ minLength: 3, maxLength: 200 })
  @IsString()
  @Length(3, 200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: PriceType })
  @IsEnum(PriceType)
  priceType!: PriceType;

  @ApiProperty({ minimum: 0.01, maximum: 99999999.99 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  price!: number;

  @ApiProperty({ minimum: 15, maximum: 1440, description: 'A multiple of 15.' })
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  @IsMultipleOf(15)
  durationMinutes!: number;
}
