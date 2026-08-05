import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /admin/reports/:id/resolve` — a terminal decision, not a status update to
 *  `REVIEWED` (that transition happens implicitly the moment an admin opens it; there
 *  is no separate endpoint for it, since nothing downstream reads `REVIEWED` as a
 *  distinct gate). */
export class ResolveReportDto {
  @ApiProperty({ enum: ['RESOLVED', 'REJECTED'], description: 'The terminal decision.' })
  @IsIn(['RESOLVED', 'REJECTED'])
  status!: 'RESOLVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsSafeText()
  adminNote?: string;
}
