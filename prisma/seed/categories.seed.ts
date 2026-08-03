import type { PrismaClient } from '@prisma/client';

/**
 * Real-world home-services taxonomy (open decision D-4 in `STATUS.md`, owner: Product —
 * taken as the default per `CLAUDE.md` §3 since the client frontend already assumes this
 * exact set of 15 leaf trades, keyed by slug, and no other content has been supplied).
 * One parent ("Home & Property Services") with 15 leaf children — flat by design, since
 * the client browses/searches by trade directly rather than drilling into sub-categories.
 *
 * `name`/`description` are the English (fallback) copy; `nameTj`/`nameRu` and
 * `descriptionTj`/`descriptionRu` are the storefront's other two locales.
 */
const TAXONOMY = [
  {
    name: 'Home & Property Services',
    nameTj: 'Хизматрасониҳои хона ва амлок',
    nameRu: 'Услуги для дома и недвижимости',
    slug: 'home-property-services',
    children: [
      {
        slug: 'plumbing',
        name: 'Plumbing Services',
        nameTj: 'Хизматрасонии сантехникӣ',
        nameRu: 'Сантехнические услуги',
        description: 'Pipe repair, leak detection, drain cleaning, tap & fixture installations.',
        descriptionTj:
          'Таъмири лӯла, ошкор кардани ништи об, тозакунии канализатсия, насби кран ва арматура.',
        descriptionRu:
          'Ремонт труб, обнаружение протечек, чистка канализации, установка кранов и сантехнической арматуры.',
      },
      {
        slug: 'electrical',
        name: 'Electrical Work',
        nameTj: 'Корҳои барқӣ',
        nameRu: 'Электромонтажные работы',
        description: 'Wiring, circuit breakers, light fixtures, switchboards & safety audits.',
        descriptionTj:
          'Симкашӣ, автоматҳои муҳофизатӣ, чароғдонҳо, тахтаи тақсимот ва санҷиши бехатарӣ.',
        descriptionRu:
          'Проводка, автоматические выключатели, светильники, распределительные щиты и проверка безопасности.',
      },
      {
        slug: 'ac-repair',
        name: 'AC Repair & HVAC',
        nameTj: 'Таъмири кондитсионер ва HVAC',
        nameRu: 'Ремонт кондиционеров и HVAC',
        description: 'Freon refill, compressor fixing, duct cleaning, annual AC servicing.',
        descriptionTj:
          'Пуркунии фреон, таъмири компрессор, тозакунии кубурҳо, хизматрасонии солонаи кондитсионер.',
        descriptionRu:
          'Заправка фреоном, ремонт компрессора, чистка воздуховодов, ежегодное обслуживание кондиционера.',
      },
      {
        slug: 'painting',
        name: 'Interior & Exterior Painting',
        nameTj: 'Ранголойии дохилӣ ва берунӣ',
        nameRu: 'Внутренняя и наружная покраска',
        description: 'Wall painting, wallpaper installation, texture coating & waterproofing.',
        descriptionTj:
          'Ранг кардани девор, часпонидани коғази девор, рӯйкаши бофта ва обногузаронӣ.',
        descriptionRu: 'Покраска стен, поклейка обоев, фактурное покрытие и гидроизоляция.',
      },
      {
        slug: 'carpentry',
        name: 'Carpentry & Woodwork',
        nameTj: 'Дуредгарӣ ва корҳои чӯбин',
        nameRu: 'Плотницкие и столярные работы',
        description: 'Custom furniture, door fittings, wooden flooring & cabinet repairs.',
        descriptionTj: 'Мебели фармоишӣ, насби дар, фарши чӯбин ва таъмири шкафҳо.',
        descriptionRu: 'Мебель на заказ, установка дверей, деревянные полы и ремонт шкафов.',
      },
      {
        slug: 'cleaning',
        name: 'Deep Cleaning',
        nameTj: 'Тозакунии амиқ',
        nameRu: 'Генеральная уборка',
        description: 'Full house deep cleaning, sofa shampooing, carpet & kitchen sanitization.',
        descriptionTj: 'Тозакунии амиқи хона, шустушӯи диван, тозакунии қолин ва ошхона.',
        descriptionRu: 'Полная уборка дома, химчистка дивана, чистка ковров и кухни.',
      },
      {
        slug: 'appliance-repair',
        name: 'Appliance Repair',
        nameTj: 'Таъмири техникаи рӯзгор',
        nameRu: 'Ремонт бытовой техники',
        description: 'Washing machine, refrigerator, microwave oven & dishwasher servicing.',
        descriptionTj: 'Хизматрасонии мошини либосшӯӣ, яхдон, печи микроволновӣ ва мошини зарфшӯӣ.',
        descriptionRu:
          'Обслуживание стиральных машин, холодильников, микроволновых печей и посудомоечных машин.',
      },
      {
        slug: 'masonry',
        name: 'Masonry & Tiling',
        nameTj: 'Сангкорӣ ва кафелкорӣ',
        nameRu: 'Каменная кладка и укладка плитки',
        description: 'Tile replacement, brickwork, marble polishing & concrete repairs.',
        descriptionTj: 'Иваз кардани кафел, хиштчинӣ, сайқали мармар ва таъмири бетон.',
        descriptionRu: 'Замена плитки, кирпичная кладка, полировка мрамора и ремонт бетона.',
      },
      {
        slug: 'welding',
        name: 'Welding & Metalwork',
        nameTj: 'Кафшергарӣ ва корҳои металлӣ',
        nameRu: 'Сварочные и металлические работы',
        description: 'Gate repair, metal railing fabrication, structural steel welding.',
        descriptionTj: 'Таъмири дарвоза, сохтани панҷараи металлӣ, кафшергарии сохти пӯлодӣ.',
        descriptionRu:
          'Ремонт ворот, изготовление металлических перил, сварка стальных конструкций.',
      },
      {
        slug: 'roofing',
        name: 'Roofing Services',
        nameTj: 'Хизматрасонии бомпӯшӣ',
        nameRu: 'Кровельные услуги',
        description: 'Roof leak waterproofing, tile replacement, gutter repair & insulation.',
        descriptionTj:
          'Обногузаронии бом, иваз кардани черепица, таъмири новаи борон ва гармикунӣ.',
        descriptionRu: 'Гидроизоляция крыши, замена черепицы, ремонт водостоков и утепление.',
      },
      {
        slug: 'interior-design',
        name: 'Interior Design',
        nameTj: 'Дизайни дохилӣ',
        nameRu: 'Дизайн интерьера',
        description: '3D space planning, color consultation, modular kitchen design.',
        descriptionTj: 'Нақшакашии 3D, маслиҳати ранг, дизайни ошхонаи модулӣ.',
        descriptionRu:
          '3D-планирование пространства, консультация по цвету, дизайн модульной кухни.',
      },
      {
        slug: 'cctv-installer',
        name: 'CCTV & Security Systems',
        nameTj: 'Насби видеокамера ва системаи бехатарӣ',
        nameRu: 'Видеонаблюдение и системы безопасности',
        description: 'IP camera setup, smart lock installation, alarm & DVR setup.',
        descriptionTj: 'Насби камераи IP, қулфи ҳушманд, ҳушдордиҳанда ва видеорегистратор.',
        descriptionRu: 'Установка IP-камер, умных замков, сигнализации и видеорегистраторов.',
      },
      {
        slug: 'networking',
        name: 'Internet & Networking',
        nameTj: 'Интернет ва шабакасозӣ',
        nameRu: 'Интернет и сетевые технологии',
        description: 'Mesh Wi-Fi setup, fiber optic cabling, office network configuration.',
        descriptionTj: 'Насби Mesh Wi-Fi, кашидани кабели нахи оптикӣ, танзими шабакаи офис.',
        descriptionRu:
          'Настройка Mesh Wi-Fi, прокладка оптоволоконного кабеля, настройка офисной сети.',
      },
      {
        slug: 'locksmith',
        name: 'Locksmith Services',
        nameTj: 'Хизматрасонии қулфбандӣ',
        nameRu: 'Услуги слесаря-замочника',
        description: 'Emergency door opening, deadbolt installation, key duplicating.',
        descriptionTj: 'Кушодани дари фаврӣ, насби қулфи амонатӣ, нусхабардории калид.',
        descriptionRu:
          'Экстренное вскрытие дверей, установка врезных замков, изготовление дубликатов ключей.',
      },
      {
        slug: 'handyman',
        name: 'General Handyman',
        nameTj: 'Устои умумӣ',
        nameRu: 'Мастер на все руки',
        description: 'TV wall mounting, curtain hanging, shelf installation & odd jobs.',
        descriptionTj:
          'Насби телевизор ба девор, овехтани пардаҳо, насби рафҳо ва корҳои хурди хона.',
        descriptionRu:
          'Крепление телевизора на стену, навешивание штор, установка полок и мелкий ремонт.',
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
      update: { name: root.name, nameTj: root.nameTj, nameRu: root.nameRu },
      create: {
        name: root.name,
        nameTj: root.nameTj,
        nameRu: root.nameRu,
        slug: root.slug,
        depth: 1,
        sortOrder: index,
      },
    });
    count += 1;

    for (const [childIndex, child] of root.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: {
          name: child.name,
          nameTj: child.nameTj,
          nameRu: child.nameRu,
          description: child.description,
          descriptionTj: child.descriptionTj,
          descriptionRu: child.descriptionRu,
        },
        create: {
          name: child.name,
          nameTj: child.nameTj,
          nameRu: child.nameRu,
          slug: child.slug,
          description: child.description,
          descriptionTj: child.descriptionTj,
          descriptionRu: child.descriptionRu,
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
