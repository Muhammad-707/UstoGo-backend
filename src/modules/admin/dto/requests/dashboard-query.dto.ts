import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/** `GET /admin/dashboard` (API.md §12, FR-11.1). Both bounds are independently optional. */
export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'ISO-8601, inclusive lower bound. Defaults per `to`.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO-8601, inclusive upper bound. Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
