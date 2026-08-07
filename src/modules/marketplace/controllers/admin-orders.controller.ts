import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { OrderResponseDto } from '../dto/responses/order.response.dto';
import { OrdersService } from '../services/orders.service';

const NOT_FOUND = { description: 'ORDER_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every order' })
  @ApiPaginatedResponse(OrderResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<PaginatedDto<OrderResponseDto>> {
    const { items, total } = await this.orders.listForAdmin(query);

    return PaginatedDto.from(
      items.map((item) => OrderResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Order detail' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async findOne(@Param('id') id: string): Promise<OrderResponseDto> {
    const order = await this.orders.getForAdmin(id);

    return OrderResponseDto.fromEntity(order);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.ORDER_CANCELLED, 'Order')
  @ApiOperation({
    summary: 'Cancel an order',
    description: 'No refund is issued — checkout is mocked, no real payment was ever taken.',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse({ description: 'ORDER_ALREADY_CANCELLED', type: ErrorResponseDto })
  async cancel(@Param('id') id: string): Promise<OrderResponseDto> {
    const order = await this.orders.cancel(id);

    return OrderResponseDto.fromEntity(order);
  }
}
