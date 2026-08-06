import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /quotes` (B-44). A pre-booking price inquiry to a master. */
export class CreateQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  masterId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Narrows the inquiry to one service.' })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiProperty({
    example: 'Kitchen sink is leaking under the cabinet.',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @Length(10, 1000)
  @IsSafeText()
  description!: string;
}
