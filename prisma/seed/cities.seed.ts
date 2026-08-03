import type { PrismaClient } from '@prisma/client';

/**
 * Reference data for Tajikistan, the product's actual market (the app's timezone
 * default and phone format both target `Asia/Dushanbe` / `+992`). Coordinates are
 * city centres.
 *
 * `name` is the English/Latin-transliterated form (fallback and slug source);
 * `nameTj` is the Tajik Cyrillic form; `nameRu` is the Russian exonym commonly used
 * for these cities (not always a literal transliteration, e.g. Kulob → Куляб).
 */
const RRP = 'Districts of Republican Subordination';

const CITIES = [
  {
    name: 'Dushanbe',
    nameTj: 'Душанбе',
    nameRu: 'Душанбе',
    slug: 'dushanbe',
    region: 'Dushanbe',
    latitude: 38.5598,
    longitude: 68.787,
  },
  {
    name: 'Khujand',
    nameTj: 'Хуҷанд',
    nameRu: 'Худжанд',
    slug: 'khujand',
    region: 'Sughd',
    latitude: 40.2833,
    longitude: 69.6333,
  },
  {
    name: 'Bokhtar',
    nameTj: 'Бохтар',
    nameRu: 'Бохтар',
    slug: 'bokhtar',
    region: 'Khatlon',
    latitude: 37.8322,
    longitude: 68.7797,
  },
  {
    name: 'Kulob',
    nameTj: 'Кӯлоб',
    nameRu: 'Куляб',
    slug: 'kulob',
    region: 'Khatlon',
    latitude: 37.9139,
    longitude: 69.7861,
  },
  {
    name: 'Istaravshan',
    nameTj: 'Истаравшан',
    nameRu: 'Истаравшан',
    slug: 'istaravshan',
    region: 'Sughd',
    latitude: 39.9086,
    longitude: 69.0058,
  },
  {
    name: 'Konibodom',
    nameTj: 'Конибодом',
    nameRu: 'Канибадам',
    slug: 'konibodom',
    region: 'Sughd',
    latitude: 40.2864,
    longitude: 70.4231,
  },
  {
    name: 'Tursunzoda',
    nameTj: 'Турсунзода',
    nameRu: 'Турсунзаде',
    slug: 'tursunzoda',
    region: RRP,
    latitude: 38.5028,
    longitude: 68.0128,
  },
  {
    name: 'Vahdat',
    nameTj: 'Ваҳдат',
    nameRu: 'Вахдат',
    slug: 'vahdat',
    region: RRP,
    latitude: 38.5589,
    longitude: 69.0272,
  },
  {
    name: 'Isfara',
    nameTj: 'Исфара',
    nameRu: 'Исфара',
    slug: 'isfara',
    region: 'Sughd',
    latitude: 40.1225,
    longitude: 70.6247,
  },
  {
    name: 'Panjakent',
    nameTj: 'Панҷакент',
    nameRu: 'Пенджикент',
    slug: 'panjakent',
    region: 'Sughd',
    latitude: 39.4964,
    longitude: 67.6083,
  },
  {
    name: 'Khorog',
    nameTj: 'Хоруғ',
    nameRu: 'Хорог',
    slug: 'khorog',
    region: 'GBAO',
    latitude: 37.4928,
    longitude: 71.5497,
  },
  {
    name: 'Norak',
    nameTj: 'Норак',
    nameRu: 'Нурек',
    slug: 'norak',
    region: 'Khatlon',
    latitude: 38.3814,
    longitude: 69.3272,
  },
  {
    name: 'Hisor',
    nameTj: 'Ҳисор',
    nameRu: 'Гиссар',
    slug: 'hisor',
    region: RRP,
    latitude: 38.5286,
    longitude: 68.5325,
  },
  {
    name: 'Rogun',
    nameTj: 'Роғун',
    nameRu: 'Рогун',
    slug: 'rogun',
    region: RRP,
    latitude: 38.6825,
    longitude: 69.7469,
  },
  {
    name: 'Yovon',
    nameTj: 'Ёвон',
    nameRu: 'Яван',
    slug: 'yovon',
    region: 'Khatlon',
    latitude: 38.3122,
    longitude: 69.0128,
  },
  {
    name: 'Danghara',
    nameTj: 'Данғара',
    nameRu: 'Дангара',
    slug: 'danghara',
    region: 'Khatlon',
    latitude: 38.2,
    longitude: 69.3006,
  },
  {
    name: 'Farkhor',
    nameTj: 'Фарҳор',
    nameRu: 'Фархор',
    slug: 'farkhor',
    region: 'Khatlon',
    latitude: 37.4897,
    longitude: 69.4064,
  },
  {
    name: 'Vose',
    nameTj: 'Восеъ',
    nameRu: 'Восе',
    slug: 'vose',
    region: 'Khatlon',
    latitude: 37.7986,
    longitude: 69.755,
  },
  {
    name: 'Shahrtuz',
    nameTj: 'Шаҳртуз',
    nameRu: 'Шаартуз',
    slug: 'shahrtuz',
    region: 'Khatlon',
    latitude: 37.2481,
    longitude: 68.1503,
  },
  {
    name: 'Sarband',
    nameTj: 'Сарбанд',
    nameRu: 'Сарбанд',
    slug: 'sarband',
    region: 'Khatlon',
    latitude: 37.9975,
    longitude: 68.7644,
  },
  {
    name: 'Buston',
    nameTj: 'Бӯстон',
    nameRu: 'Бустон',
    slug: 'buston',
    region: 'Sughd',
    latitude: 40.2364,
    longitude: 69.7239,
  },
  {
    name: 'Qayroqqum',
    nameTj: 'Қайроққум',
    nameRu: 'Кайраккум',
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
      update: { name: city.name, nameTj: city.nameTj, nameRu: city.nameRu, region: city.region },
      create: {
        name: city.name,
        nameTj: city.nameTj,
        nameRu: city.nameRu,
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
