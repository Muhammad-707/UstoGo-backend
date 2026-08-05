import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /admin/certificates` (MASTER_PROMPT.md §6.17). */
export class AdminCertificateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by moderation state. Omit to list every certificate.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verified?: boolean;
}
