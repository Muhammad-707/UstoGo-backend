import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /quotes` (B-44). */
export class ListQuotesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
