import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** `POST /admin/users/:id/block` (MASTER_PROMPT.md §6.11), same 10–500 char shape as
 *  the masters module's moderation reasons (FR-4.2/4.3). */
export class ReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
