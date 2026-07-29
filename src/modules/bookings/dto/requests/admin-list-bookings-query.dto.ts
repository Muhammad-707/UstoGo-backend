import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional } from 'class-validator';

import { ListBookingsQueryDto } from './list-bookings-query.dto';

/** `GET /admin/bookings` (API.md §12) — adds the two participant filters. */
export class AdminListBookingsQueryDto extends ListBookingsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  masterId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;
}
