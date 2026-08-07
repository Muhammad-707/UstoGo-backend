import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../../constants/marketplace.constants';

/** `POST /cart/items`. Adding an already-present product increments its quantity. */
export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional({ minimum: MIN_ITEM_QUANTITY, maximum: MAX_ITEM_QUANTITY, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ITEM_QUANTITY)
  @Max(MAX_ITEM_QUANTITY)
  quantity?: number;
}
