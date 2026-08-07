import { ApiProperty } from '@nestjs/swagger';

export type CartItemWithProduct = {
  productId: string;
  quantity: number;
  product: {
    name: string;
    price: { toFixed: (n: number) => string };
    currency: string;
    isActive: boolean;
    images: { imageUrl: string }[];
  };
};

export class CartItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ nullable: true, description: 'The product’s cover photo, if it has one.' })
  imageUrl!: string | null;

  @ApiProperty()
  unitPrice!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  subtotal!: string;

  @ApiProperty({
    description: 'False once the product has since been deactivated — cannot be checked out.',
  })
  isAvailable!: boolean;

  static fromEntity(entity: CartItemWithProduct): CartItemResponseDto {
    const dto = new CartItemResponseDto();

    dto.productId = entity.productId;
    dto.productName = entity.product.name;
    dto.imageUrl = entity.product.images[0]?.imageUrl ?? null;
    dto.unitPrice = entity.product.price.toFixed(2);
    dto.currency = entity.product.currency;
    dto.quantity = entity.quantity;
    dto.subtotal = (Number(entity.product.price.toFixed(2)) * entity.quantity).toFixed(2);
    dto.isAvailable = entity.product.isActive;

    return dto;
  }
}

export class CartResponseDto {
  @ApiProperty({ type: CartItemResponseDto, isArray: true })
  items!: CartItemResponseDto[];

  @ApiProperty()
  totalAmount!: string;

  @ApiProperty({ nullable: true })
  currency!: string | null;

  static fromEntities(entities: CartItemWithProduct[]): CartResponseDto {
    const dto = new CartResponseDto();

    dto.items = entities.map((entity) => CartItemResponseDto.fromEntity(entity));
    dto.totalAmount = dto.items.reduce((sum, item) => sum + Number(item.subtotal), 0).toFixed(2);
    dto.currency = entities[0]?.product.currency ?? null;

    return dto;
  }
}
