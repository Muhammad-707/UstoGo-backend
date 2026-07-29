import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /reviews/:id/reply` (FR-8.3) — reviewed master only, one reply per review. */
export class ReplyReviewDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  @IsSafeText()
  body!: string;
}
