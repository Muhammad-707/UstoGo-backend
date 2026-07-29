import type { PrismaTransaction } from '@prisma-lib/transaction.manager';

import {
  CategoryDepthExceededException,
  CategoryInvalidParentException,
  CategoryNotFoundException,
} from '../../exceptions/categories.exceptions';
import { assertNotDescendant, reparent, shiftSubtreeDepth, subtreeMaxDepth } from '../subtree.util';

/** A row keyed by id, each with its own parentId/depth/children — enough to fake the
 *  handful of queries these helpers issue. */
type Fixture = Record<string, { parentId: string | null; depth: number }>;

const txFor = (fixture: Fixture): PrismaTransaction => {
  const childrenOf = (parentId: string): Array<{ id: string }> =>
    Object.entries(fixture)
      .filter(([, row]) => row.parentId === parentId)
      .map(([id]) => ({ id }));

  return {
    category: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const row = fixture[where.id];
        return Promise.resolve(row === undefined ? null : { id: where.id, ...row });
      }),
      findMany: jest.fn(({ where }: { where: { parentId: string } }) =>
        Promise.resolve(childrenOf(where.parentId)),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: { in: string[] } };
          data: { depth: { increment: number } };
        }) => {
          for (const id of where.id.in) {
            const row = fixture[id];
            if (row !== undefined) {
              row.depth += data.depth.increment;
            }
          }
          return Promise.resolve({ count: where.id.in.length });
        },
      ),
    },
  } as unknown as PrismaTransaction;
};

describe('assertNotDescendant', () => {
  it('rejects self-parenting', async () => {
    const tx = txFor({ a: { parentId: null, depth: 1 } });

    await expect(assertNotDescendant(tx, 'a', 'a')).rejects.toBeInstanceOf(
      CategoryInvalidParentException,
    );
  });

  it('rejects parenting under a descendant', async () => {
    const tx = txFor({
      a: { parentId: null, depth: 1 },
      b: { parentId: 'a', depth: 2 },
    });

    await expect(assertNotDescendant(tx, 'a', 'b')).rejects.toBeInstanceOf(
      CategoryInvalidParentException,
    );
  });

  it('allows parenting under an unrelated category', async () => {
    const tx = txFor({
      a: { parentId: null, depth: 1 },
      other: { parentId: null, depth: 1 },
    });

    await expect(assertNotDescendant(tx, 'a', 'other')).resolves.toBeUndefined();
  });
});

describe('subtreeMaxDepth', () => {
  it('returns the category own depth when it has no children', async () => {
    const tx = txFor({ a: { parentId: null, depth: 2 } });

    await expect(subtreeMaxDepth(tx, 'a', 2)).resolves.toBe(2);
  });

  it('returns the deepest descendant depth', async () => {
    const tx = txFor({
      a: { parentId: null, depth: 1 },
      b: { parentId: 'a', depth: 2 },
      c: { parentId: 'b', depth: 3 },
    });

    await expect(subtreeMaxDepth(tx, 'a', 1)).resolves.toBe(3);
  });
});

describe('shiftSubtreeDepth', () => {
  it('does nothing when delta is zero', async () => {
    const tx = txFor({ a: { parentId: null, depth: 1 }, b: { parentId: 'a', depth: 2 } });

    await shiftSubtreeDepth(tx, 'a', 0);

    expect(tx.category.findMany).not.toHaveBeenCalled();
  });

  it('shifts every descendant by the same delta', async () => {
    const fixture: Fixture = {
      a: { parentId: null, depth: 1 },
      b: { parentId: 'a', depth: 2 },
      c: { parentId: 'b', depth: 3 },
    };
    const tx = txFor(fixture);

    await shiftSubtreeDepth(tx, 'a', 1);

    expect(fixture.b?.depth).toBe(3);
    expect(fixture.c?.depth).toBe(4);
  });
});

describe('reparent', () => {
  it('moves a root category under another, computing its new depth', async () => {
    const tx = txFor({
      a: { parentId: null, depth: 1 },
      target: { parentId: null, depth: 1 },
    });

    await expect(reparent(tx, 'a', 1, 'target')).resolves.toEqual({ parentId: 'target', depth: 2 });
  });

  it('moves a category to the root when newParentId is null', async () => {
    const tx = txFor({ a: { parentId: 'p', depth: 2 } });

    await expect(reparent(tx, 'a', 2, null)).resolves.toEqual({ parentId: null, depth: 1 });
  });

  it('rejects a move that would exceed the max depth', async () => {
    const tx = txFor({
      a: { parentId: null, depth: 1 },
      child: { parentId: 'a', depth: 2 }, // gives `a` a subtree height of one level below it
      target: { parentId: null, depth: 2 }, // already at depth 2 — one more level is 3 max
    });

    await expect(reparent(tx, 'a', 1, 'target')).rejects.toBeInstanceOf(
      CategoryDepthExceededException,
    );
  });

  it('rejects a move onto a parent that does not exist', async () => {
    const tx = txFor({ a: { parentId: null, depth: 1 } });

    await expect(reparent(tx, 'a', 1, 'ghost')).rejects.toBeInstanceOf(CategoryNotFoundException);
  });
});
