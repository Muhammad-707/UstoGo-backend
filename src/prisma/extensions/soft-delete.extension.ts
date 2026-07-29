import { Prisma } from '@prisma/client';

/**
 * Models carrying a `deletedAt` column (DATABASE.md §1). Reference data and
 * hard-deleted rows — City, RefreshToken, PasswordResetToken — are absent by design.
 */
export const SOFT_DELETABLE_MODELS: ReadonlySet<string> = new Set([
  'User',
  'ClientProfile',
  'MasterProfile',
  'File',
]);

/**
 * Read operations rewritten to exclude soft-deleted rows.
 *
 * `findUnique` is included because Prisma 5 onwards accepts non-unique filters in a
 * unique where-clause alongside the unique field. Without it, the single most natural
 * lookup in the codebase — by id — would be the one path that returns deleted rows.
 *
 * `aggregate` and `groupBy` are included for the same reason `count` is: a total that
 * silently includes deleted rows is a wrong answer, not a partial one.
 */
export const FILTERED_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

type FilterableArgs = { where?: Record<string, unknown> };

/**
 * An explicit `deletedAt` in the caller's own where-clause always wins. That is the
 * seam `withDeleted()` repository variants use to reach deleted rows deliberately;
 * without it this extension would make them unreachable rather than merely hidden.
 */
export const applyNotDeleted = <T>(args: T): T => {
  // Generic in, generic out: the caller passes Prisma's per-model argument union and
  // must get the same type back. The cast narrows only the one property this function
  // touches; `where` is optional on every operation in FILTERED_OPERATIONS.
  const typed = (args ?? {}) as FilterableArgs;
  const where = typed.where ?? {};

  if ('deletedAt' in where) {
    return typed as T;
  }

  return { ...typed, where: { ...where, deletedAt: null } } as T;
};

export const shouldFilter = (model: string | undefined, operation: string): boolean =>
  model !== undefined && SOFT_DELETABLE_MODELS.has(model) && FILTERED_OPERATIONS.has(operation);

/**
 * Centralises soft-delete filtering so that no service ever writes `deletedAt: null`
 * by hand (DATABASE.md §1). A filter applied by hand is a filter eventually forgotten.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return shouldFilter(model, operation) ? query(applyNotDeleted(args)) : query(args);
      },
    },
  },
});
