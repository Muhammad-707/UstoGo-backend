import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetInstantBookDto {
  @ApiProperty({ description: 'B-24 — opt in to auto-accepting bookings once eligible.' })
  @IsBoolean()
  enabled!: boolean;
}
