import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
}
