import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** FR-4.2/4.3: rejection and deactivation both require a 10–500 character reason. */
export class ReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
