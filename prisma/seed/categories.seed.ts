import type { PrismaClient } from '@prisma/client';

/**
 * Real-world home-services taxonomy (open decision D-4 in `STATUS.md`, owner: Product —
 * taken as the default per `CLAUDE.md` §3 since the client frontend already assumes this
 * exact set of 15 leaf trades, keyed by slug, and no other content has been supplied).
 * One parent ("Home & Property Services") with 15 leaf children — flat by design, since
 * the client browses/searches by trade directly rather than drilling into sub-categories.
 */
const TAXONOMY = [
  {
    name: 'Home & Property Services',
    slug: 'home-property-services',
    children: [
      {
        slug: 'plumbing',
        name: 'Plumbing Services',
        description: 'Pipe repair, leak detection, drain cleaning, tap & fixture installations.',
      },
      {
        slug: 'electrical',
        name: 'Electrical Work',
        description: 'Wiring, circuit breakers, light fixtures, switchboards & safety audits.',
      },
      {
        slug: 'ac-repair',
        name: 'AC Repair & HVAC',
        description: 'Freon refill, compressor fixing, duct cleaning, annual AC servicing.',
      },
      {
        slug: 'painting',
        name: 'Interior & Exterior Painting',
        description: 'Wall painting, wallpaper installation, texture coating & waterproofing.',
      },
      {
        slug: 'carpentry',
        name: 'Carpentry & Woodwork',
        description: 'Custom furniture, door fittings, wooden flooring & cabinet repairs.',
      },
      {
        slug: 'cleaning',
        name: 'Deep Cleaning',
        description: 'Full house deep cleaning, sofa shampooing, carpet & kitchen sanitization.',
      },
      {
        slug: 'appliance-repair',
        name: 'Appliance Repair',
        description: 'Washing machine, refrigerator, microwave oven & dishwasher servicing.',
      },
      {
        slug: 'masonry',
        name: 'Masonry & Tiling',
        description: 'Tile replacement, brickwork, marble polishing & concrete repairs.',
      },
      {
        slug: 'welding',
        name: 'Welding & Metalwork',
        description: 'Gate repair, metal railing fabrication, structural steel welding.',
      },
      {
        slug: 'roofing',
        name: 'Roofing Services',
        description: 'Roof leak waterproofing, tile replacement, gutter repair & insulation.',
      },
      {
        slug: 'interior-design',
        name: 'Interior Design',
        description: '3D space planning, color consultation, modular kitchen design.',
      },
      {
        slug: 'cctv-installer',
        name: 'CCTV & Security Systems',
        description: 'IP camera setup, smart lock installation, alarm & DVR setup.',
      },
      {
        slug: 'networking',
        name: 'Internet & Networking',
        description: 'Mesh Wi-Fi setup, fiber optic cabling, office network configuration.',
      },
      {
        slug: 'locksmith',
        name: 'Locksmith Services',
        description: 'Emergency door opening, deadbolt installation, key duplicating.',
      },
      {
        slug: 'handyman',
        name: 'General Handyman',
        description: 'TV wall mounting, curtain hanging, shelf installation & odd jobs.',
      },
    ],
  },
] as const;

/** Upserts on `slug` — idempotent, safe to re-run against a populated database. */
export const seedCategories = async (prisma: PrismaClient): Promise<number> => {
  let count = 0;

  for (const [index, root] of TAXONOMY.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: root.slug },
      update: { name: root.name },
      create: { name: root.name, slug: root.slug, depth: 1, sortOrder: index },
    });
    count += 1;

    for (const [childIndex, child] of root.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, description: child.description },
        create: {
          name: child.name,
          slug: child.slug,
          description: child.description,
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
