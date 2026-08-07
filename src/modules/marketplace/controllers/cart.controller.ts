import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { AddCartItemDto } from '../dto/requests/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/requests/update-cart-item.dto';
import { CartResponseDto } from '../dto/responses/cart.response.dto';
import { CartService } from '../services/cart.service';

@ApiTags('Marketplace')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: "The caller's cart, with a computed total" })
  @ApiOkResponse({ type: CartResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<CartResponseDto> {
    const items = await this.cart.list(user.id);

    return CartResponseDto.fromEntities(items);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Add a product to the cart',
    description: 'Adding an already-present product increments its quantity, capped at 99.',
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  async addItem(
    @Body() dto: AddCartItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CartResponseDto> {
    await this.cart.addItem(user.id, dto.productId, dto.quantity ?? 1);
    const items = await this.cart.list(user.id);

    return CartResponseDto.fromEntities(items);
  }

  @Patch('items/:productId')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Set a cart line’s exact quantity',
    description: 'The "+ / -" stepper.',
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiNotFoundResponse({ description: 'CART_ITEM_NOT_FOUND', type: ErrorResponseDto })
  async setQuantity(
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CartResponseDto> {
    await this.cart.setQuantity(user.id, productId, dto.quantity);
    const items = await this.cart.list(user.id);

    return CartResponseDto.fromEntities(items);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Remove a cart line', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async removeItem(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.cart.removeItem(user.id, productId);
  }
}
