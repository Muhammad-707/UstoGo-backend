import type { PrismaClient } from '@prisma/client';

/**
 * Starter reference data. The definitive list is open decision D-4 in `STATUS.md`
 * (owner: Product); this set follows the `Asia/Tashkent` timezone that DATABASE.md
 * §3.3 uses as its worked example, and is replaced rather than extended once D-4
 * closes. Coordinates are city centres.
 */
const CITIES = [
  { name: 'Tashkent', slug: 'tashkent', region: 'Tashkent', latitude: 41.2995, longitude: 69.2401 },
  {
    name: 'Samarkand',
    slug: 'samarkand',
    region: 'Samarkand',
    latitude: 39.627,
    longitude: 66.975,
  },
  { name: 'Bukhara', slug: 'bukhara', region: 'Bukhara', latitude: 39.7681, longitude: 64.4556 },
  { name: 'Namangan', slug: 'namangan', region: 'Namangan', latitude: 40.9983, longitude: 71.6726 },
  { name: 'Andijan', slug: 'andijan', region: 'Andijan', latitude: 40.7821, longitude: 72.3442 },
  { name: 'Fergana', slug: 'fergana', region: 'Fergana', latitude: 40.3864, longitude: 71.7864 },
  { name: 'Nukus', slug: 'nukus', region: 'Karakalpakstan', latitude: 42.4531, longitude: 59.6103 },
  { name: 'Qarshi', slug: 'qarshi', region: 'Qashqadaryo', latitude: 38.8606, longitude: 65.7891 },
  { name: 'Urgench', slug: 'urgench', region: 'Xorazm', latitude: 41.5506, longitude: 60.6314 },
  { name: 'Termez', slug: 'termez', region: 'Surxondaryo', latitude: 37.2242, longitude: 67.2783 },
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

  return CITIES.length;
};
