import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';

import { WorkingDayDto } from './working-day.dto';

/** `PUT /masters/me/schedule` replaces the whole weekly set atomically (FR-6.1). */
export class ReplaceScheduleDto {
  @ApiProperty({ type: WorkingDayDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  @ArrayMaxSize(7 * 4)
  days!: WorkingDayDto[];
}
