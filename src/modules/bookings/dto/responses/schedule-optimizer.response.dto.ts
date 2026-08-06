import { ApiProperty } from '@nestjs/swagger';

export class OptimizedStopDto {
  @ApiProperty({ example: 1, description: '1-based suggested visiting order.' })
  order!: number;

  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({ example: 'UG-2026-000123' })
  bookingNumber!: string;

  @ApiProperty()
  serviceTitle!: string;

  @ApiProperty()
  scheduledAt!: string;

  @ApiProperty()
  district!: string;
}

/** `GET /bookings/me/schedule-optimizer?date=` (nearest-neighbor route suggestion). */
export class ScheduleOptimizerResponseDto {
  @ApiProperty({ example: '2026-08-10' })
  date!: string;

  @ApiProperty({ type: [OptimizedStopDto] })
  stops!: OptimizedStopDto[];

  @ApiProperty({ description: 'Total travel distance (km) in the suggested order.' })
  totalDistanceKm!: number;

  @ApiProperty({ description: 'What the same stops would cost in plain chronological order.' })
  chronologicalDistanceKm!: number;

  @ApiProperty({ description: 'chronologicalDistanceKm - totalDistanceKm, floored at 0.' })
  estimatedSavingsKm!: number;
}
