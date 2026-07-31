import type { PrismaClient } from '@prisma/client';

/**
 * Reference data for Tajikistan, the product's actual market (the app's timezone
 * default and phone format both target `Asia/Dushanbe` / `+992`). Coordinates are
 * city centres.
 */
const RRP = 'Districts of Republican Subordination';

const CITIES = [
  { name: 'Dushanbe', slug: 'dushanbe', region: 'Dushanbe', latitude: 38.5598, longitude: 68.787 },
  { name: 'Khujand', slug: 'khujand', region: 'Sughd', latitude: 40.2833, longitude: 69.6333 },
  { name: 'Bokhtar', slug: 'bokhtar', region: 'Khatlon', latitude: 37.8322, longitude: 68.7797 },
  { name: 'Kulob', slug: 'kulob', region: 'Khatlon', latitude: 37.9139, longitude: 69.7861 },
  {
    name: 'Istaravshan',
    slug: 'istaravshan',
    region: 'Sughd',
    latitude: 39.9086,
    longitude: 69.0058,
  },
  { name: 'Konibodom', slug: 'konibodom', region: 'Sughd', latitude: 40.2864, longitude: 70.4231 },
  { name: 'Tursunzoda', slug: 'tursunzoda', region: RRP, latitude: 38.5028, longitude: 68.0128 },
  { name: 'Vahdat', slug: 'vahdat', region: RRP, latitude: 38.5589, longitude: 69.0272 },
  { name: 'Isfara', slug: 'isfara', region: 'Sughd', latitude: 40.1225, longitude: 70.6247 },
  { name: 'Panjakent', slug: 'panjakent', region: 'Sughd', latitude: 39.4964, longitude: 67.6083 },
  { name: 'Khorog', slug: 'khorog', region: 'GBAO', latitude: 37.4928, longitude: 71.5497 },
  { name: 'Norak', slug: 'norak', region: 'Khatlon', latitude: 38.3814, longitude: 69.3272 },
  { name: 'Hisor', slug: 'hisor', region: RRP, latitude: 38.5286, longitude: 68.5325 },
  { name: 'Rogun', slug: 'rogun', region: RRP, latitude: 38.6825, longitude: 69.7469 },
  { name: 'Yovon', slug: 'yovon', region: 'Khatlon', latitude: 38.3122, longitude: 69.0128 },
  { name: 'Danghara', slug: 'danghara', region: 'Khatlon', latitude: 38.2, longitude: 69.3006 },
  { name: 'Farkhor', slug: 'farkhor', region: 'Khatlon', latitude: 37.4897, longitude: 69.4064 },
  { name: 'Vose', slug: 'vose', region: 'Khatlon', latitude: 37.7986, longitude: 69.755 },
  { name: 'Shahrtuz', slug: 'shahrtuz', region: 'Khatlon', latitude: 37.2481, longitude: 68.1503 },
  { name: 'Sarband', slug: 'sarband', region: 'Khatlon', latitude: 37.9975, longitude: 68.7644 },
  { name: 'Buston', slug: 'buston', region: 'Sughd', latitude: 40.2364, longitude: 69.7239 },
  {
    name: 'Qayroqqum',
    slug: 'qayroqqum',
    region: 'Sughd',
    latitude: 40.2667,
    longitude: 69.8167,
  },
] as const;

/**
 * Upserts on `slug`, so re-running the seed against a populated database is a no-op
 * rather than a unique-constraint failure. A seed that can only run once is a seed
 * nobody runs.
 */
export const seedCities = async (prisma: PrismaClient): Promise<number> => {
  for (const city of CITIES) {
    await prisma.city.upsert({
      where: { slug: city.slug },
      update: { name: city.name, region: city.region },
      create: {
        name: city.name,
        slug: city.slug,
        region: city.region,
        latitude: city.latitude,
        longitude: city.longitude,
      },
    });
  }

  // Drops cities from an earlier reference set (e.g. the old placeholder Uzbekistan
  // list) that are no longer in CITIES. onDelete: Restrict on client/master profiles
  // means a city still referenced by a profile simply survives the cleanup instead of
  // failing the whole seed run.
  const currentSlugs = CITIES.map((city) => city.slug);
  const stale = await prisma.city.findMany({
    where: { slug: { notIn: currentSlugs } },
    select: { id: true, slug: true },
  });
  for (const city of stale) {
    await prisma.city.delete({ where: { id: city.id } }).catch(() => {
      // Referenced by an existing profile — leave it in place rather than fail the seed.
    });
  }

  return CITIES.length;
};
