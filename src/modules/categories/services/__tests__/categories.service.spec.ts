import type { FilesService } from '@modules/files/services/files.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  CategoryDepthExceededException,
  CategoryInUseException,
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '../../exceptions/categories.exceptions';
import { CategoriesService } from '../categories.service';

const CATEGORY = {
  id: 'cat-1',
  parentId: null,
  slug: 'plumbing',
  name: 'Plumbing',
  description: null,
  iconFileId: null,
  depth: 1,
  sortOrder: 0,
  isActive: true,
};

const build = (
  overrides: {
    category?: Partial<Record<string, jest.Mock>>;
    files?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const categoryDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(CATEGORY),
    update: jest.fn().mockResolvedValue(CATEGORY),
    ...overrides.category,
  };
  const prisma = { db: { category: categoryDelegate } } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) => fn({ category: categoryDelegate }),
  } as unknown as TransactionManager;
  const files = {
    getAttachable: jest.fn().mockResolvedValue({ id: 'file-1' }),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides.files,
  } as unknown as FilesService;

  return { service: new CategoriesService(prisma, tx, files), categoryDelegate, files };
};

describe('CategoriesService.getTree', () => {
  it('fetches active categories and caches the built tree', async () => {
    const { service, categoryDelegate } = build({
      category: { findMany: jest.fn().mockResolvedValue([CATEGORY]) },
    });

    const first = await service.getTree();
    const second = await service.getTree();

    expect(first).toEqual(second);
    expect(categoryDelegate.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('CategoriesService.getBySlug', () => {
  it('throws when no active category matches', async () => {
    const { service } = build();

    await expect(service.getBySlug('ghost')).rejects.toBeInstanceOf(CategoryNotFoundException);
  });

  it('resolves ancestors root-first and children with their own leaf state', async () => {
    const child = { ...CATEGORY, id: 'cat-2', slug: 'pipes', parentId: 'cat-1', depth: 2 };
    const { service, categoryDelegate } = build({
      category: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(CATEGORY) // the requested category
          .mockResolvedValueOnce(null), // no more ancestors (parentId is null)
        findMany: jest.fn().mockResolvedValue([{ ...child, _count: { children: 0 } }]),
      },
    });

    const result = await service.getBySlug('plumbing');

    expect(result.ancestors).toEqual([]);
    expect(result.children).toHaveLength(1);
    expect(result.children[0]?.id).toBe('cat-2');
    expect(categoryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: 'cat-1', isActive: true } }),
    );
  });
});

describe('CategoriesService.create', () => {
  it('rejects a taken slug before touching the parent or inserting', async () => {
    const { service, categoryDelegate } = build({
      category: { findUnique: jest.fn().mockResolvedValue(CATEGORY) },
    });

    await expect(
      service.create({ name: 'Plumbing', slug: 'plumbing' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CategorySlugTakenException);
    expect(categoryDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects a parent already at the maximum depth', async () => {
    const { service } = build({
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // slug check
          .mockResolvedValueOnce({ ...CATEGORY, depth: 3 }), // parent
      },
    });

    await expect(
      service.create({ name: 'x', slug: 'x', parentId: 'cat-1' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CategoryDepthExceededException);
  });

  it('verifies the icon belongs to the admin and is confirmed for CATEGORY_ICON', async () => {
    const { service, files } = build();

    await service.create({ name: 'x', slug: 'x', iconFileId: 'file-1' }, 'admin-1');

    expect(files.getAttachable).toHaveBeenCalledWith('file-1', 'admin-1', 'CATEGORY_ICON');
  });

  it('creates a root category at depth 1 when no parent is given', async () => {
    const { service, categoryDelegate } = build();

    await service.create({ name: 'Plumbing', slug: 'plumbing' }, 'admin-1');

    expect(categoryDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ depth: 1 }) }),
    );
  });
});

describe('CategoriesService.update', () => {
  it('throws when the category does not exist', async () => {
    const { service } = build();

    await expect(service.update('ghost', { name: 'x' }, 'admin-1')).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
  });

  it('applies simple field changes without touching parentId', async () => {
    const { service, categoryDelegate } = build({
      category: { findUnique: jest.fn().mockResolvedValue(CATEGORY) },
    });

    await service.update('cat-1', { name: 'New name' }, 'admin-1');

    expect(categoryDelegate.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'New name' },
    });
  });

  it('releases the previous icon file when it is replaced', async () => {
    const withIcon = { ...CATEGORY, iconFileId: 'old-file' };
    const { service, files } = build({
      category: { findUnique: jest.fn().mockResolvedValue(withIcon) },
    });

    await service.update('cat-1', { iconFileId: 'new-file' }, 'admin-1');

    expect(files.softDelete).toHaveBeenCalledWith('old-file');
  });
});

describe('CategoriesService.remove', () => {
  it('throws when the category does not exist', async () => {
    const { service } = build();

    await expect(service.remove('ghost')).rejects.toBeInstanceOf(CategoryNotFoundException);
  });

  it('refuses to remove a category that has a child', async () => {
    const { service, categoryDelegate } = build({
      category: {
        findUnique: jest.fn().mockResolvedValue(CATEGORY),
        findFirst: jest.fn().mockResolvedValue({ id: 'child' }),
      },
    });

    await expect(service.remove('cat-1')).rejects.toBeInstanceOf(CategoryInUseException);
    expect(categoryDelegate.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a childless category', async () => {
    const { service, categoryDelegate } = build({
      category: { findUnique: jest.fn().mockResolvedValue(CATEGORY) },
    });

    await service.remove('cat-1');

    expect(categoryDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat-1' }, data: { deletedAt: expect.any(Date) } }),
    );
  });
});
