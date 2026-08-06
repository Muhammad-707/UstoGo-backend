import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `PATCH /masters/me/quick-replies/:id` (B-35). */
export class UpdateQuickReplyDto {
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @Length(1, 300)
  @IsSafeText()
  text!: string;
}
