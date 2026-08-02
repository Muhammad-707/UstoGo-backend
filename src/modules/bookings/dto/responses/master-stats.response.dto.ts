import { ApiProperty } from '@nestjs/swagger';

class DailyEarningDto {
  @ApiProperty({ example: '2026-08-01', description: 'ISO date (yyyy-mm-dd), local to UTC.' })
  date!: string;

  @ApiProperty({ example: '150.00' })
  total!: string;
}

class CategoryEarningDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ example: 'Plumbing' })
  categoryName!: string;

  @ApiProperty({
    example: '1200.00',
    description: 'Sum of price for COMPLETED bookings in this category.',
  })
  total!: string;

  @ApiProperty({ example: 14, description: 'Count of COMPLETED bookings in this category.' })
  completedCount!: number;
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

  @ApiProperty({
    type: CategoryEarningDto,
    isArray: true,
    description: 'Completed earnings by service category, richest first.',
  })
  earningsByCategory!: CategoryEarningDto[];

  @ApiProperty({
    example: 22.5,
    nullable: true,
    description:
      'Average minutes between a booking being created and accepted. Null with no accepted bookings yet.',
  })
  avgAcceptLatencyMinutes!: number | null;

  @ApiProperty({
    example: 34.2,
    description:
      'Share of distinct clients (among those with a COMPLETED booking) who booked this master more than once, as a percentage.',
  })
  repeatClientRate!: number;

  @ApiProperty({ example: 128, description: 'Total public profile views, all-time.' })
  profileViews!: number;
}
