import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

/**
 * `GET /masters/:id/availability` (API.md §7, FR-6.3). The 31-day cap is enforced by
 * `AvailabilityService`, not `MaxRangeDays` here — FR-6.3 gives it its own code,
 * `DATE_RANGE_TOO_LARGE`, and a DTO-level check would only ever produce the generic
 * `VALIDATION_FAILED` instead.
 */
export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString({ strict: true })
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString({ strict: true })
  to!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  serviceId!: string;
}
