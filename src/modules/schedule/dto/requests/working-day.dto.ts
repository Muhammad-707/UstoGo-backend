import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min } from 'class-validator';

import { IsAfterField } from '@common/validators';

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WorkingDayDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm 24-hour format' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm 24-hour format' })
  @IsAfterField('startTime')
  endTime!: string;
}
