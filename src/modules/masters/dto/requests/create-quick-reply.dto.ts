import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /masters/me/quick-replies` (B-35). */
export class CreateQuickReplyDto {
  @ApiProperty({ example: "I'm running about 15 minutes late.", minLength: 1, maxLength: 300 })
  @IsString()
  @Length(1, 300)
  @IsSafeText()
  text!: string;
}
