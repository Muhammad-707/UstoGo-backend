import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export type OrderWithItems = {
  id: string;
  clientProfileId: string;
  status: OrderStatus;
  totalAmount: { toFixed: (n: number) => string };
  currency: string;
  createdAt: Date;
  items: {
    productId: string;
    productName: string;
    unitPrice: { toFixed: (n: number) => string };
    quantity: number;
  }[];
};

export class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  unitPrice!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  subtotal!: string;
}

/** Never the Prisma entity directly — `clientProfileId` is exposed only so an owner can
 * confirm a listing is theirs; it is never used to authorize (that happens in the service). */
export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  totalAmount!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: OrderItemResponseDto, isArray: true })
  items!: OrderItemResponseDto[];

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: OrderWithItems): OrderResponseDto {
    const dto = new OrderResponseDto();

    dto.id = entity.id;
    dto.status = entity.status;
    dto.totalAmount = entity.totalAmount.toFixed(2);
    dto.currency = entity.currency;
    dto.createdAt = entity.createdAt.toISOString();
    dto.items = entity.items.map((item) => {
      const itemDto = new OrderItemResponseDto();
      itemDto.productId = item.productId;
      itemDto.productName = item.productName;
      itemDto.unitPrice = item.unitPrice.toFixed(2);
      itemDto.quantity = item.quantity;
      itemDto.subtotal = (Number(item.unitPrice.toFixed(2)) * item.quantity).toFixed(2);
      return itemDto;
    });

    return dto;
  }
}
