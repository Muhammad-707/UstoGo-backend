import { ApiProperty } from '@nestjs/swagger';

/** One day of computed slots, `GET /masters/:id/availability` (FR-6.3). */
export class DaySlotsResponseDto {
  @ApiProperty({ example: '2026-08-03', description: 'Calendar date in the master’s timezone' })
  date!: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Free slot starts as UTC instants',
  })
  free!: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Already-taken slot starts as UTC instants',
  })
  busy!: string[];
}
