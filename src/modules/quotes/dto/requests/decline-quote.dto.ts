import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /quotes/:id/decline` (B-44, MASTER only). Reason mandatory. */
export class DeclineQuoteDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  @IsSafeText()
  reason!: string;
}
