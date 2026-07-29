import type { PrismaTransaction } from '@prisma-lib/transaction.manager';

import { MAX_CATEGORY_DEPTH } from '../constants/category.constants';
import {
  CategoryDepthExceededException,
  CategoryInvalidParentException,
  CategoryNotFoundException,
} from '../exceptions/categories.exceptions';

/**
 * Reparenting requires three DB-bound checks the pure tree builder cannot do —
 * walking a live parent chain, and reading/writing a live subtree — so these live
 * here rather than in `category-tree.util.ts` (ARCHITECTURE.md §2: pure logic and I/O
 * are different layers).
 */

/** Self-parenting is caught on the first iteration: `candidateParentId === categoryId`. */
export const assertNotDescendant = async (
  tx: PrismaTransaction,
  categoryId: string,
  candidateParentId: string,
): Promise<void> => {
  let current: string | null = candidateParentId;

  while (current !== null) {
    if (current === categoryId) {
      throw new CategoryInvalidParentException();
    }

    const row: { parentId: string | null } | null = await tx.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = row?.parentId ?? null;
  }
};

/** The deepest depth in the subtree rooted at `categoryId`, category itself included. */
export const subtreeMaxDepth = async (
  tx: PrismaTransaction,
  categoryId: string,
  depth: number,
): Promise<number> => {
  const children = await tx.category.findMany({
    where: { parentId: categoryId },
    select: { id: true },
  });

  if (children.length === 0) {
    return depth;
  }

  const depths = await Promise.all(
    children.map((child) => subtreeMaxDepth(tx, child.id, depth + 1)),
  );

  return Math.max(...depths);
};

export const shiftSubtreeDepth = async (
  tx: PrismaTransaction,
  parentId: string,
  delta: number,
): Promise<void> => {
  if (delta === 0) {
    return;
  }

  const children = await tx.category.findMany({ where: { parentId }, select: { id: true } });

  if (children.length === 0) {
    return;
  }

  await tx.category.updateMany({
    where: { id: { in: children.map((child) => child.id) } },
    data: { depth: { increment: delta } },
  });

  await Promise.all(children.map((child) => shiftSubtreeDepth(tx, child.id, delta)));
};

export type ReparentResult = { readonly parentId: string | null; readonly depth: number };

/**
 * Validates and applies a reparent: no cycle, the new depth within `MAX_CATEGORY_DEPTH`,
 * the whole subtree within it too, then shifts every descendant's `depth` by the same
 * delta in one pass. Returns the fields the caller merges into its own `update` — the
 * subtree rows are already written by the time this returns.
 */
export const reparent = async (
  tx: PrismaTransaction,
  categoryId: string,
  currentDepth: number,
  newParentId: string | null,
): Promise<ReparentResult> => {
  let newDepth = 1;

  if (newParentId !== null) {
    await assertNotDescendant(tx, categoryId, newParentId);
    const parent = await tx.category.findUnique({ where: { id: newParentId } });

    if (parent === null) {
      throw new CategoryNotFoundException();
    }
    newDepth = parent.depth + 1;
  }

  const maxDepth = await subtreeMaxDepth(tx, categoryId, currentDepth);
  const delta = newDepth - currentDepth;

  if (maxDepth + delta > MAX_CATEGORY_DEPTH) {
    throw new CategoryDepthExceededException();
  }

  await shiftSubtreeDepth(tx, categoryId, delta);

  return { parentId: newParentId, depth: newDepth };
};
