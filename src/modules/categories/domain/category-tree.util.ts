/**
 * Pure, no I/O (ARCHITECTURE.md §2). The service fetches only active, non-deleted
 * rows, so this never has to check `isActive` itself — a leaf, by `DATABASE.md` §5.1's
 * definition, is a category with no active children, and once the input is already
 * active-only, "no children after this runs" and "no active children" are the same
 * question.
 */
export type CategoryRow = {
  readonly id: string;
  readonly parentId: string | null;
  readonly slug: string;
  readonly name: string;
  readonly nameTj: string | null;
  readonly nameRu: string | null;
  readonly description: string | null;
  readonly descriptionTj: string | null;
  readonly descriptionRu: string | null;
  readonly iconFileId: string | null;
  readonly depth: number;
  readonly sortOrder: number;
};

export type CategoryNode = Omit<CategoryRow, 'parentId'> & {
  readonly children: readonly CategoryNode[];
  readonly isLeaf: boolean;
};

/** Strips `parentId` off a row — the shared shape of a leaf `CategoryNode`. */
export const toNodeFields = (row: CategoryRow): Omit<CategoryNode, 'children' | 'isLeaf'> => {
  const { parentId: _parentId, ...fields } = row;

  return fields;
};

const bySortOrder = (rows: readonly CategoryRow[]): CategoryRow[] =>
  [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

/**
 * Builds the tree from roots downward, following each node's own id into the
 * children map. A row whose `parentId` names an id that is not itself present in
 * `rows` — the child of a category this fetch excluded, typically an inactive parent
 * — is never reached this way, which is what keeps such a row out of the "active
 * tree" FR-5.1 promises rather than promoting it to a false root.
 */
export const buildCategoryTree = (rows: readonly CategoryRow[]): CategoryNode[] => {
  const byParent = new Map<string | null, CategoryRow[]>();

  for (const row of rows) {
    const siblings = byParent.get(row.parentId);
    if (siblings === undefined) {
      byParent.set(row.parentId, [row]);
    } else {
      siblings.push(row);
    }
  }

  const build = (parentId: string | null): CategoryNode[] =>
    bySortOrder(byParent.get(parentId) ?? []).map((row): CategoryNode => {
      const { parentId: _parentId, ...fields } = row;
      const children = build(row.id);

      return { ...fields, children, isLeaf: children.length === 0 };
    });

  return build(null);
};
