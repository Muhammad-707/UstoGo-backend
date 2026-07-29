import { buildCategoryTree, type CategoryRow } from '../category-tree.util';

const row = (overrides: Partial<CategoryRow> & { id: string }): CategoryRow => ({
  parentId: null,
  slug: overrides.id,
  name: overrides.id,
  description: null,
  iconFileId: null,
  depth: 1,
  sortOrder: 0,
  ...overrides,
});

describe('buildCategoryTree', () => {
  it('returns an empty tree for no rows', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });

  it('nests children under their parent and marks leaves', () => {
    const rows = [row({ id: 'root', depth: 1 }), row({ id: 'child', parentId: 'root', depth: 2 })];

    const tree = buildCategoryTree(rows);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('root');
    expect(tree[0]?.isLeaf).toBe(false);
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe('child');
    expect(tree[0]?.children[0]?.isLeaf).toBe(true);
  });

  it('sorts siblings by sortOrder then name', () => {
    const rows = [
      row({ id: 'b', sortOrder: 1, name: 'B' }),
      row({ id: 'a', sortOrder: 1, name: 'A' }),
      row({ id: 'c', sortOrder: 0, name: 'C' }),
    ];

    expect(buildCategoryTree(rows).map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops a row whose parent is not in the input (an inactive/excluded parent)', () => {
    const rows = [row({ id: 'orphan', parentId: 'ghost', depth: 2 })];

    expect(buildCategoryTree(rows)).toEqual([]);
  });

  it('builds three levels deep', () => {
    const rows = [
      row({ id: 'a', depth: 1 }),
      row({ id: 'b', parentId: 'a', depth: 2 }),
      row({ id: 'c', parentId: 'b', depth: 3 }),
    ];

    const tree = buildCategoryTree(rows);

    expect(tree[0]?.children[0]?.children[0]?.id).toBe('c');
    expect(tree[0]?.children[0]?.isLeaf).toBe(false);
    expect(tree[0]?.children[0]?.children[0]?.isLeaf).toBe(true);
  });
});
