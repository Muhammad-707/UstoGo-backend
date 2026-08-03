/**
 * Stock media fallbacks for demo masters who never uploaded their own files
 * (avatarFileId/bannerFileId are null and the portfolio is empty). Instead of
 * blank images or initial-letter placeholders, the API issues direct, realistic
 * stock photos (Unsplash CDN, free for demo projects):
 *
 *  - avatar  -> a real person's portrait, picked by the master's gender (inferred from first name)
 *  - banner  -> strictly tied to the master's profession (category slug)
 *  - gallery -> 3-4 portfolio photos of the same profession
 *
 * Every URL below has been validated against images.unsplash.com (HTTP 200).
 * Selection is deterministic per name so a master always gets the same photos.
 */

const unsplash = (id: string, w: number): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

/** Real portraits used for male demo masters (w=400, avatar size). */
const MALE_AVATARS: readonly string[] = [
  unsplash('1507003211169-0a1dd7228f2d', 400),
  unsplash('1500648767791-00dcc994a43e', 400),
  unsplash('1560250097-0b93528c311a', 400),
  unsplash('1472099645785-5658abf4ff4e', 400),
  unsplash('1540569014015-19a7be504e3a', 400),
  unsplash('1506794778202-cad84cf45f1d', 400),
  unsplash('1519085360753-af0119f7cbe7', 400),
  unsplash('1508214751196-bcfd4ca60f91', 400),
];

/** Real portraits used for female demo masters (w=400, avatar size). */
const FEMALE_AVATARS: readonly string[] = [
  unsplash('1494790108377-be9c29b29330', 400),
  unsplash('1438761681033-6461ffad8d80', 400),
  unsplash('1544005313-94ddf0286df2', 400),
  unsplash('1573496359142-b8d87734a5a2', 400),
  unsplash('1580489944761-15a19d654956', 400),
  unsplash('1517841905240-472988babdf9', 400),
  unsplash('1554151228-14d9def656e4', 400),
  unsplash('1531123897727-8f129e1688ce', 400),
];

/**
 * Profession-scoped imagery, keyed by the category slug used by the seeder.
 * `banner` is the wide cover (w=1200); `gallery` is 3-4 portfolio shots (w=800).
 */
const PROFESSION_MEDIA: Readonly<Record<string, { banner: string; gallery: readonly string[] }>> = {
  plumbing: {
    banner: unsplash('1585128792020-803d29415281', 1200),
    gallery: [
      unsplash('1529269421632-e9253d14d3a9', 800),
      unsplash('1584622650111-993a426fbf0a', 800),
      unsplash('1545193329-4a052e14eb8f', 800),
      unsplash('1607472586893-edb57bdc0e39', 800),
    ],
  },
  electrical: {
    banner: unsplash('1621905251189-08b45d6a269e', 1200),
    gallery: [
      unsplash('1558494949-ef010cbdcc31', 800),
      unsplash('1581092160607-ee22621dd758', 800),
      unsplash('1621905252507-b35492cc74b4', 800),
      unsplash('1601462904263-f2fa0c851cb9', 800),
    ],
  },
  'ac-repair': {
    banner: unsplash('1647022528152-52ed9338611d', 1200),
    gallery: [
      unsplash('1651474738521-efacfb201039', 800),
      unsplash('1566917064245-1c6bff30dbf1', 800),
      unsplash('1545649311-24d0ac00ae82', 800),
      unsplash('1581092335397-9583eb92d232', 800),
    ],
  },
  painting: {
    banner: unsplash('1562259949-e8e7689d7828', 1200),
    gallery: [
      unsplash('1589939705384-5185137a7f0f', 800),
      unsplash('1511822148790-e7b58ba14c72', 800),
      unsplash('1562664377-709f2c337eb2', 800),
      unsplash('1556801587-bbbb66081240', 800),
    ],
  },
  carpentry: {
    banner: unsplash('1618366712010-f4ae9c647dcb', 1200),
    gallery: [
      unsplash('1544164560-adac3045edb2', 800),
      unsplash('1473700216830-7e08d47f858e', 800),
      unsplash('1497218770144-3fea6dbc33fe', 800),
      unsplash('1547609434-b732edfee020', 800),
    ],
  },
  cleaning: {
    banner: unsplash('1581578731548-c64695cc6952', 1200),
    gallery: [
      unsplash('1584820927498-cfe5211fd8bf', 800),
      unsplash('1563453392212-326f5e854473', 800),
      unsplash('1528740561666-dc2479dc08ab', 800),
      unsplash('1580256081112-e49377338b7f', 800),
    ],
  },
  'appliance-repair': {
    banner: unsplash('1601524909162-ae8725290836', 1200),
    gallery: [
      unsplash('1574267432553-4b4628081c31', 800),
      unsplash('1621905251918-48416bd8575a', 800),
      unsplash('1581093588401-fbb62a02f120', 800),
      unsplash('1604335399105-a0c585fd81a1', 800),
    ],
  },
  masonry: {
    banner: unsplash('1615873968403-89e068629265', 1200),
    gallery: [
      unsplash('1560185127-6ed189bf02f4', 800),
      unsplash('1513508111811-9c87fccad7d1', 800),
      unsplash('1559322575-2f4e66131d55', 800),
      unsplash('1574102560324-77a5653088f7', 800),
    ],
  },
  welding: {
    banner: unsplash('1504917595217-d4dc5ebe6122', 1200),
    gallery: [
      unsplash('1504328345606-18bbc8c9d7d1', 800),
      unsplash('1485881922961-fbe39329af2a', 800),
      unsplash('1530124566582-a618bc2615dc', 800),
      unsplash('1565043666747-69f6646db940', 800),
    ],
  },
  roofing: {
    banner: unsplash('1518736346281-76873166a64a', 1200),
    gallery: [
      unsplash('1512917774080-9991f1c4c750', 800),
      unsplash('1632765854612-9b02b6ec2b15', 800),
      unsplash('1590365876016-da05ac533e83', 800),
      unsplash('1544620347-4fd4a3d5957', 800),
    ],
  },
  'interior-design': {
    banner: unsplash('1618221195710-dd6b41faaea6', 1200),
    gallery: [
      unsplash('1600585154340-be6161a56a0c', 800),
      unsplash('1616486338812-3dadae4b4ace', 800),
      unsplash('1618220179428-22790b461013', 800),
      unsplash('1586023492125-27b2c045efd7', 800),
    ],
  },
  'cctv-installer': {
    banner: unsplash('1557597774-9d273605dfa9', 1200),
    gallery: [
      unsplash('1558002038-1055907df827', 800),
      unsplash('1526374965328-7f61d4dc18c5', 800),
      unsplash('1614064641938-3bbee52942c7', 800),
      unsplash('1496368077930-c1e31b4e5b44', 800),
    ],
  },
  networking: {
    banner: unsplash('1544197150-b99a580bb7a8', 1200),
    gallery: [
      unsplash('1573164574572-cb89e39749b4', 800),
      unsplash('1563770660941-20978e870e26', 800),
      unsplash('1531668383211-64743e924c66', 800),
      unsplash('1595185450075-fd6c73860756', 800),
    ],
  },
  locksmith: {
    banner: unsplash('1583356322882-85559b472f56', 1200),
    gallery: [
      unsplash('1570125909232-eb263c188f7e', 800),
      unsplash('1600565193348-f74bd3c7ccdf', 800),
      unsplash('1531417666976-ed2bdbeb043b', 800),
      unsplash('1588689653688-9b312cd6bc2b', 800),
    ],
  },
  handyman: {
    banner: unsplash('1416879595882-3373a0480b5b', 1200),
    gallery: [
      unsplash('1585386959984-a4155224a1ad', 800),
      unsplash('1555597673-b21d5c935865', 800),
      unsplash('1593307315564-c96172dc89dc', 800),
      unsplash('1595345263387-c01f60e7c1b9', 800),
    ],
  },
};

/** Fallbacks for an unknown/uncategorized profession — generic tools imagery. */
const FALLBACK_BANNER = unsplash('1585386959984-a4155224a1ad', 1200);
const FALLBACK_GALLERY: readonly string[] = [
  unsplash('1416879595882-3373a0480b5b', 800),
  unsplash('1530124566582-a618bc2615dc', 800),
  unsplash('1555597673-b21d5c935865', 800),
  unsplash('1593307315564-c96172dc89dc', 800),
];

/** Female first names; everything else (including the «ends with -a» heuristic) falls out below. */
const FEMALE_FIRST_NAMES = new Set([
  'elena',
  'sarah',
  'sara',
  'nigora',
  'anna',
  'anya',
  'maria',
  'mariya',
  'mary',
  'svetlana',
  'olga',
  'irina',
  'natasha',
  'natalia',
  'dilnoza',
  'gulnora',
  'firuza',
  'malika',
  'zebo',
  'mohira',
  'shahnoza',
  'nargiza',
  'madina',
  'zulfiya',
  'julia',
  'julie',
  'emily',
  'sophie',
  'sophia',
  'sofia',
  'olivia',
  'hannah',
  'grace',
  'nina',
  'marina',
  'sabina',
  'valentina',
  'karina',
  'daria',
  'yana',
  'alina',
  'vera',
  'tatiana',
  'tatyana',
  'lidia',
  'oksana',
  'jane',
  'lucy',
  'laura',
  'anastasia',
  'ekaterina',
  'katerina',
  'zhanna',
  'lola',
]);

const hashSeed = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pick = <T>(items: readonly T[], seed: string): T => {
  const item = items[hashSeed(seed) % items.length];
  if (item !== undefined) return item;
  throw new Error('stock media pool must not be empty');
};

/**
 * Determines the master's gender from the first name, so avatars can show a
 * portrait of the right gender. Explicit female-name list first, then the
 * common «ends with -a/-я» Slavic/Tajik heuristic; everything else is male.
 */
export const inferGender = (name: string): 'male' | 'female' => {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length === 0) return 'male';
  if (FEMALE_FIRST_NAMES.has(first)) return 'female';
  if (first.endsWith('a') || first.endsWith('я')) return 'female';
  return 'male';
};

/** Portrait URL for a master without an uploaded avatar — gender-matched to the name. */
export const stockAvatarUrlFor = (name: string): string => {
  const pool = inferGender(name) === 'female' ? FEMALE_AVATARS : MALE_AVATARS;
  return pick(pool, name.trim() || '0');
};

/** Wide cover strictly tied to the master's profession (category slug). */
export const stockBannerUrlFor = (categorySlug: string | null | undefined): string =>
  categorySlug !== null && categorySlug !== undefined
    ? (PROFESSION_MEDIA[categorySlug]?.banner ?? FALLBACK_BANNER)
    : FALLBACK_BANNER;

/** 3-4 portfolio photos of the same profession as the banner. */
export const stockGalleryFor = (categorySlug: string | null | undefined): readonly string[] =>
  categorySlug !== null && categorySlug !== undefined
    ? (PROFESSION_MEDIA[categorySlug]?.gallery ?? FALLBACK_GALLERY)
    : FALLBACK_GALLERY;
