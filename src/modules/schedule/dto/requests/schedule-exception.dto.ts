import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { TIME_PATTERN } from './working-day.dto';

/** `POST /masters/me/schedule/exceptions` (FR-6.2). */
export class CreateScheduleExceptionDto {
  @ApiProperty({ example: '2026-08-15' })
  @IsDateString({ strict: true })
  date!: string;

  @ApiProperty()
  @IsBoolean()
  isDayOff!: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm 24-hour format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm 24-hour format' })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
