import { ApiProperty } from '@nestjs/swagger';

export class DashboardUsersDto {
  @ApiProperty() clients!: number;
  @ApiProperty() masters!: number;
  @ApiProperty() admins!: number;
  @ApiProperty() blocked!: number;
}

export class DashboardMastersDto {
  @ApiProperty() pending!: number;
  @ApiProperty() approved!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() inactive!: number;
}

export class DashboardBookingsDto {
  @ApiProperty() pending!: number;
  @ApiProperty() accepted!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty() expired!: number;
}

export class DashboardRatesDto {
  @ApiProperty() completionRate!: number;
  @ApiProperty() cancellationRate!: number;
  @ApiProperty() acceptanceRate!: number;
}

export class DashboardReviewsDto {
  @ApiProperty() count!: number;
  @ApiProperty() averageRating!: number;
}

export class DashboardCancellationReasonDto {
  @ApiProperty({ example: 'PRICE_TOO_HIGH', nullable: true, description: 'null = no code given' })
  code!: string | null;
  @ApiProperty() count!: number;
}

export class DashboardTopCategoryDto {
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() bookings!: number;
}

export class DashboardSeriesPointDto {
  @ApiProperty({ example: '2026-07-01' }) date!: string;
  @ApiProperty() created!: number;
  @ApiProperty() completed!: number;
}

/** `GET /admin/dashboard` response shape (API.md §12, FR-11.1). */
export class DashboardResponseDto {
  @ApiProperty({ type: DashboardUsersDto }) users!: DashboardUsersDto;
  @ApiProperty({ type: DashboardMastersDto }) masters!: DashboardMastersDto;
  @ApiProperty({ type: DashboardBookingsDto }) bookings!: DashboardBookingsDto;
  @ApiProperty({ type: DashboardRatesDto }) rates!: DashboardRatesDto;
  @ApiProperty({ type: [DashboardCancellationReasonDto] })
  cancellationReasons!: DashboardCancellationReasonDto[];
  @ApiProperty({ type: DashboardReviewsDto }) reviews!: DashboardReviewsDto;
  @ApiProperty({ type: [DashboardTopCategoryDto] }) topCategories!: DashboardTopCategoryDto[];
  @ApiProperty({ type: [DashboardSeriesPointDto] }) series!: DashboardSeriesPointDto[];
}
