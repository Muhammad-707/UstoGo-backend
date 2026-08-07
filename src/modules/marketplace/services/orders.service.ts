import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import type { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { ORDER_WITH_ITEMS_INCLUDE, type OrderRow } from './order-includes';
import {
  OrderAlreadyCancelledException,
  OrderNotFoundException,
} from '../exceptions/marketplace.exceptions';

export type OrderPage = { readonly items: OrderRow[]; readonly total: number };

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async clientProfileId(userId: string): Promise<string> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return clientProfile.id;
  }

  async listForClient(userId: string, query: PaginationQueryDto): Promise<OrderPage> {
    const clientProfileId = await this.clientProfileId(userId);

    return this.paginate({ clientProfileId }, query);
  }

  async getForClient(userId: string, orderId: string): Promise<OrderRow> {
    const clientProfileId = await this.clientProfileId(userId);
    const order = await this.findByIdOrThrow(orderId);

    if (order.clientProfileId !== clientProfileId) {
      throw new OrderNotFoundException();
    }

    return order;
  }

  async listForAdmin(query: PaginationQueryDto): Promise<OrderPage> {
    return this.paginate({}, query);
  }

  async getForAdmin(orderId: string): Promise<OrderRow> {
    return this.findByIdOrThrow(orderId);
  }

  /** No refund is issued — no real payment was ever taken (checkout is mocked). */
  async cancel(orderId: string): Promise<OrderRow> {
    const order = await this.findByIdOrThrow(orderId);

    if (order.status === OrderStatus.CANCELLED) {
      throw new OrderAlreadyCancelledException();
    }

    return this.prisma.db.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
  }

  private async paginate(
    where: { clientProfileId?: string },
    query: PaginationQueryDto,
  ): Promise<OrderPage> {
    const [items, total] = await Promise.all([
      this.prisma.db.order.findMany({
        where,
        include: ORDER_WITH_ITEMS_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.order.count({ where }),
    ]);

    return { items, total };
  }

  private async findByIdOrThrow(id: string): Promise<OrderRow> {
    const order = await this.prisma.db.order.findUnique({
      where: { id },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });

    if (order === null) {
      throw new OrderNotFoundException();
    }

    return order;
  }
}
