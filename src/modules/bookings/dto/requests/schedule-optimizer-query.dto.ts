import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

/** `GET /bookings/me/schedule-optimizer`. */
export class ScheduleOptimizerQueryDto {
  @ApiProperty({ example: '2026-08-10' })
  @IsDateString({ strict: true })
  date!: string;
}
