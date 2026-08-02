import { ApiProperty } from '@nestjs/swagger';

class DailyEarningDto {
  @ApiProperty({ example: '2026-08-01', description: 'ISO date (yyyy-mm-dd), local to UTC.' })
  date!: string;

  @ApiProperty({ example: '150.00' })
  total!: string;
}

/** F-09 dashboard analytics — GET /bookings/me/stats (master only). */
export class MasterStatsResponseDto {
  @ApiProperty({
    example: '4250.00',
    description: 'Sum of price for all COMPLETED bookings, ever.',
  })
  totalEarnings!: string;

  @ApiProperty({ type: DailyEarningDto, isArray: true, description: 'Last 14 days, oldest first.' })
  dailyEarnings!: DailyEarningDto[];

  @ApiProperty({ example: 12 })
  pendingCount!: number;

  @ApiProperty({ example: 8 })
  acceptedCount!: number;

  @ApiProperty({ example: 40 })
  completedCount!: number;

  @ApiProperty({ example: 5 })
  cancelledCount!: number;

  @ApiProperty({
    example: 78.4,
    description: 'completed / (completed + cancelled + rejected + expired), as a percentage.',
  })
  completionRate!: number;
}
