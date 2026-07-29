import type { PrismaClient } from '@prisma/client';

/**
 * Starter taxonomy. The definitive list is open decision D-4 in `STATUS.md` (owner:
 * Product); this two-level set is what F-05's depth/leaf rules need to be exercised
 * against, and is replaced rather than extended once D-4 closes.
 */
const TAXONOMY = [
  {
    name: 'Home Services',
    slug: 'home-services',
    children: [
      { name: 'Plumbing', slug: 'plumbing' },
      { name: 'Electrical', slug: 'electrical' },
      { name: 'Cleaning', slug: 'cleaning' },
      { name: 'Appliance Repair', slug: 'appliance-repair' },
    ],
  },
  {
    name: 'Beauty & Wellness',
    slug: 'beauty-wellness',
    children: [
      { name: 'Hairdressing', slug: 'hairdressing' },
      { name: 'Massage', slug: 'massage' },
      { name: 'Nail Care', slug: 'nail-care' },
    ],
  },
  {
    name: 'Tutoring',
    slug: 'tutoring',
    children: [
      { name: 'Languages', slug: 'languages' },
      { name: 'Mathematics', slug: 'mathematics' },
    ],
  },
] as const;

/** Upserts on `slug` — idempotent, safe to re-run against a populated database. */
export const seedCategories = async (prisma: PrismaClient): Promise<number> => {
  let count = 0;

  for (const [index, root] of TAXONOMY.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: root.slug },
      update: {},
      create: { name: root.name, slug: root.slug, depth: 1, sortOrder: index },
    });
    count += 1;

    for (const [childIndex, child] of root.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: {},
        create: {
          name: child.name,
          slug: child.slug,
          depth: 2,
          sortOrder: childIndex,
          parentId: parent.id,
        },
      });
      count += 1;
    }
  }

  return count;
};
