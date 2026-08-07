import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../../constants/marketplace.constants';

/** `PATCH /cart/items/:productId` — sets the exact quantity (the "+ / -" stepper's result). */
export class UpdateCartItemDto {
  @ApiProperty({ minimum: MIN_ITEM_QUANTITY, maximum: MAX_ITEM_QUANTITY })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ITEM_QUANTITY)
  @Max(MAX_ITEM_QUANTITY)
  quantity!: number;
}
