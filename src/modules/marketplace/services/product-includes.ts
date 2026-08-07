import { Prisma } from '@prisma/client';

/** The projection `ProductResponseDto.fromEntity` needs — one place it is built. */
export const PRODUCT_WITH_IMAGES_INCLUDE = {
  category: { select: { name: true } },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_WITH_IMAGES_INCLUDE }>;
