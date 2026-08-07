import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Length } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /products` and `GET /admin/products` — the admin listing additionally sees inactive rows. */
export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Matched against the product name.' })
  @IsOptional()
  @Length(1, 100)
  search?: string;
}
