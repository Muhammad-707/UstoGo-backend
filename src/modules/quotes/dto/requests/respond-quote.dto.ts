import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /quotes/:id/respond` (B-44, MASTER only). */
export class RespondQuoteDto {
  @ApiProperty({ example: 45.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estimatedPrice!: number;

  @ApiProperty({ enum: PriceType })
  @IsEnum(PriceType)
  priceType!: PriceType;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsSafeText()
  note?: string;
}
