import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MasterStatsMonthPointDto {
  @ApiProperty({ description: 'YYYY-MM' })
  month!: string;

  @ApiProperty()
  bookings!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty({ description: 'Sum of completed bookings’ price, as a decimal string.' })
  revenue!: string;
}

export class MasterStatsTopServiceDto {
  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  completedCount!: number;

  @ApiProperty({ description: 'Sum of this service’s completed bookings’ price.' })
  revenue!: string;
}

/**
 * `GET /admin/masters/:id/stats` (MASTER_PROMPT.md §5.2). Every field is a fresh
 * aggregate query, following `DashboardService`'s own precedent (F-15) rather than a
 * denormalised counter: an admin's stats page is a low-QPS, read-heavy surface where
 * "always correct" is worth more than the write-path complexity of keeping a counter
 * in sync across every booking/review transition.
 */
export class AdminMasterStatsResponseDto {
  @ApiProperty({ format: 'uuid' })
  masterId!: string;

  @ApiProperty({ description: 'Distinct clients across every COMPLETED booking.' })
  totalClientsServed!: number;

  @ApiProperty()
  completedJobs!: number;

  @ApiProperty({
    description: 'PENDING + ACCEPTED + IN_PROGRESS + every CANCELLED_*/REJECTED/EXPIRED booking.',
  })
  unfinishedJobs!: number;

  @ApiProperty()
  avgRating!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiPropertyOptional({ nullable: true, description: 'null when there are no NPS responses yet.' })
  nps!: number | null;

  @ApiProperty({ description: 'NPS response count backing `nps`.' })
  npsResponseCount!: number;

  @ApiProperty({
    description: 'Visible-review star distribution, keys 1–5.',
    example: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 10 },
  })
  reviewsBreakdown!: Record<'1' | '2' | '3' | '4' | '5', number>;

  @ApiProperty({ type: MasterStatsMonthPointDto, isArray: true, description: 'Last 6 months.' })
  monthlySeries!: MasterStatsMonthPointDto[];

  @ApiProperty({ type: MasterStatsTopServiceDto, isArray: true, description: 'Top 5 by revenue.' })
  topServices!: MasterStatsTopServiceDto[];
}
