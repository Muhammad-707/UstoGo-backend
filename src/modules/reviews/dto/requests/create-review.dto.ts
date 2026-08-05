import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /reviews` (FR-8.1). */
export class CreateReviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  bookingId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @IsSafeText()
  comment?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 10,
    description:
      'NPS §6.1: "How likely are you to recommend this master?" — 0–10. Optional; a ' +
      'client who skips the survey still leaves a plain star review.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  npsScore?: number;

  @ApiPropertyOptional({ description: 'Companion yes/no to npsScore.' })
  @IsOptional()
  @IsBoolean()
  wouldRecommend?: boolean;
}
