import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import { Idempotent } from '@modules/idempotency/decorators/idempotent.decorator';

import { OrderResponseDto } from '../dto/responses/order.response.dto';
import { CheckoutService } from '../services/checkout.service';
import { OrdersService } from '../services/orders.service';

const NOT_FOUND = { description: 'ORDER_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Marketplace')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Check out the cart',
    description:
      'Mocked payment — no card data is collected, the order is PAID the instant it is ' +
      'created. A cart line whose product has since been deactivated is excluded and ' +
      'left in the cart. An optional Idempotency-Key header prevents a double-tap from ' +
      'creating two orders.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CART_EMPTY', type: ErrorResponseDto })
  async checkoutCart(@CurrentUser() user: AuthenticatedUser): Promise<OrderResponseDto> {
    const order = await this.checkout.checkout(user.id);

    return OrderResponseDto.fromEntity(order);
  }

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: "The caller's order history" })
  @ApiPaginatedResponse(OrderResponseDto)
  async list(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<OrderResponseDto>> {
    const { items, total } = await this.orders.listForClient(user.id, query);

    return PaginatedDto.from(
      items.map((item) => OrderResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Order detail', description: 'Owner only — else 404.' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponseDto> {
    const order = await this.orders.getForClient(user.id, id);

    return OrderResponseDto.fromEntity(order);
  }
}
