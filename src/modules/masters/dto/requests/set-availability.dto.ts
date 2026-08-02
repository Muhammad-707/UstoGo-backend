import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAvailabilityDto {
  @ApiProperty({ description: 'false = "not accepting bookings" / vacation mode.' })
  @IsBoolean()
  isActive!: boolean;
}
