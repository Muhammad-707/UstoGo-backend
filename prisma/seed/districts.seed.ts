import type { PrismaClient } from '@prisma/client';

/**
 * Reference data for the internal sub-divisions of every city in the product's
 * market. Dushanbe's four official districts; for the other cities the official
 * jamoats/mahallas of the city itself. Keyed by the city `slug` from
 * `cities.seed.ts`, so this file must be seeded after cities.
 */
const DISTRICTS_BY_CITY_SLUG: Record<string, readonly string[]> = {
  dushanbe: ['Исмоили Сомонӣ', 'Сино', 'Фирдавсӣ', 'Шоҳмансур'],
  khujand: [
    'Хуҷанд',
    'Тути калон',
    'Чорчароғ',
    'Раззоқ',
    'Масҷиди Савр',
    'Қорӣ Раҳмат Қурбонов',
    'Содир Ҳофиз',
    'Шарқ',
    'Сарибаланд',
    'Ҷаббор Расулов',
    '1 Май',
    'Сирдарё',
    'Сайҳун',
    'Чашмаи Арзана',
    'Бофанда',
    'Ваҳдат',
    'Темурмалик',
    'Тиллакон',
    'Мевагул',
    'Суғдиёна',
    'Дӯстии халқҳо',
    'Навбаҳор',
  ],
  bokhtar: [
    'Бохтар',
    'Баҳор',
    'Ваҳдат-1',
    'Ваҳдат-2',
    'Ваҳдат-3',
    'Ғайрат',
    'Гулзор',
    'Дӯстии халқҳо',
    'Дӯстӣ',
    'Ломоносов',
    'Маданият',
    'Маданияти поён',
    'Навобод',
    'Навободи нав',
    'Ҳаёти нав',
  ],
  kulob: ['Кӯлоб', 'Зарбдор', 'Зиракӣ', 'Даҳана'],
  istaravshan: [
    'Истаравшан',
    'Зарҳалол',
    'Чорбоғ',
    'Гули Сурх',
    'Ҷавкандак',
    'Ниҷонӣ',
    'Нафароҷ',
    'Пошкент',
    'Қалъачаи Калон',
    'Қалъаи Баланд',
    'Сабристон',
  ],
  tursunzoda: [
    'Турсунзода',
    'Регар',
    'Қаратоғ',
    'Даҳсолаи Истиқлолият',
    'Навобод',
    'Пахтаобод',
    'Турсун Тӯйчиев',
    'Работ',
    'Сешанбе',
    'Ҷӯра Раҳмонов',
  ],
  konibodom: ['Конибодом', 'Фирузоба', 'Лоҳутӣ', 'Патар', 'Пулотон', 'Ҳамробоев', 'Куҳандиёр'],
  isfara: [
    'Исфара',
    'Нефтеабад',
    'Нурафшон',
    'Шураб',
    'Ворух',
    'Зумрад',
    'Кулканд',
    'Лаккон',
    'Навгилем',
    'Сурх',
    'Хонобод',
    'Чилгазӣ',
    'Чоркӯҳ',
  ],
  panjakent: [
    'Панҷакент',
    'Амондара',
    'Вору',
    'Ёрӣ',
    'Косатарош',
    'Лоик Шералӣ',
    'Моғиён',
    'Рӯдакӣ',
    'Саразм',
    'Суҷина',
    'Фароб',
    'Халифа Ҳасан',
    'Ҳурмӣ',
    'Чинор',
    'Шинг',
  ],
  vahdat: [
    'Ваҳдат',
    'Нуъмон Розиқ',
    'Абдулло Абдулвосиев',
    'Баҳор',
    'Бозорбой Бурунов',
    'Дӯстӣ',
    'Гулистон',
    'Карим Исмоилов',
    'Ромит',
    'Симиганҷ',
    'Чорсӯ',
    'Чӯянгарон',
  ],
  yovon: [
    'Ёвон',
    'Ҳаётинав',
    'Даҳана',
    'Гулсара',
    'Норин',
    'Обшорон',
    'Ҳасан Ҳусайн',
    'Ситораи Сурх',
    'Чоргул',
  ],
  buston: ['Бӯстон', 'Палос'],
  norak: ['Норак', 'Пули Сангин', 'Дуконӣ'],
  danghara: [
    'Данғара',
    'Сафобахш',
    'Пушинг',
    'Корез',
    'Сангтуда',
    'Себистон',
    'Исмати Шариф',
    'Лолазор',
    'Лохур',
  ],
  khorog: ['Моёншо Назаршоев', 'Сайфулло Абдуллоев', 'Шош-Хоруғ', 'Бархоруғ', '75-солагии ВМКБ'],
  hisor: [
    'Сохтмончиён',
    'Ҳамадонӣ',
    'Рӯдакӣ',
    'Пахтаобод',
    'Шарқ',
    'Мирзо Ризо',
    'Юсупов',
    'Ғафуров',
    'Гагарин',
    'Белайдуз',
    'Омӯзгор',
    'Айнӣ',
    'К. Хуҷандӣ',
    'А. Берунӣ',
    'Боқӣ Раҳимзода',
  ],
  farkhor: [
    'Фархор',
    'Ватан',
    'Ҳутан',
    'Гулшан',
    'Дарқад',
    'Деҳқонобод',
    'Зафар',
    'Истиқлол',
    'Хуросон',
  ],
  vose: [
    'Ҳулбук',
    'Миралиобод',
    'Гулистон',
    'Абди Авазов',
    'Абуабдулло Рӯдакӣ',
    'Бобошоҳиён',
    'Худоёр Раҷабов',
    'Тугарак',
  ],
  shahrtuz: ['Тус', 'Айваҷ', 'Обшорон', 'Пахтаобод', 'Талбак Садриддинов', 'Тоҷдорон'],
  sarband: ['Леваканд', 'Гулистон', 'Ваҳдат'],
  qayroqqum: ['Гулистон', 'Адрасмон', 'Зарнисор', 'Навгарзан', 'Сирдарё', 'Консой', 'Чоруқдайррон'],
  rogun: ['Роғун', 'Обигарм', 'Қадиоб', 'Сичароғ'],
};

/** ASCII-safe-ish slug for a district name: lowercased, spaces and punctuation to dashes. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[\s._'/]+/g, '-')
    .replace(/[^a-zа-яёӣӯқғҳҷцӣ0-9-]/g, '')
    .replace(/-+/g, '-');

/**
 * Upserts on (cityId, slug), so re-running against a populated database is a no-op.
 * Districts from an earlier set that are no longer in the map are withdrawn
 * (`isActive = false`) rather than deleted, so historical bookings keep resolving.
 */
export const seedDistricts = async (prisma: PrismaClient): Promise<number> => {
  const cities = await prisma.city.findMany({ select: { id: true, slug: true } });
  const cityIdBySlug = new Map(cities.map((city) => [city.slug, city.id]));
  const expectedSlugs = new Set(Object.keys(DISTRICTS_BY_CITY_SLUG));

  let total = 0;
  for (const [citySlug, names] of Object.entries(DISTRICTS_BY_CITY_SLUG)) {
    const cityId = cityIdBySlug.get(citySlug);
    if (cityId === undefined) continue;

    for (const name of names) {
      const slug = slugify(name);
      await prisma.district.upsert({
        where: { cityId_slug: { cityId, slug } },
        update: { name, isActive: true },
        create: { cityId, name, slug },
      });
      total += 1;
    }
  }

  const stale = await prisma.district.findMany({
    where: { cityId: { in: cities.map((city) => city.id) }, isActive: true },
    select: { id: true, cityId: true, slug: true },
  });
  for (const district of stale) {
    const citySlug = [...cityIdBySlug.entries()].find(([, id]) => id === district.cityId)?.[0];
    if (citySlug !== undefined && expectedSlugs.has(citySlug)) {
      const current = DISTRICTS_BY_CITY_SLUG[citySlug] ?? [];
      if (!current.some((name) => slugify(name) === district.slug)) {
        await prisma.district.update({
          where: { id: district.id },
          data: { isActive: false },
        });
      }
    }
  }

  return total;
};
