import { Prisma } from '@prisma/client';

export const ORDER_WITH_ITEMS_INCLUDE = {
  items: true,
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_ITEMS_INCLUDE }>;
