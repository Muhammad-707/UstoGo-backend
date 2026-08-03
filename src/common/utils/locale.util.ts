/**
 * The three languages the storefront ships (frontend `i18n/locales.ts`). Reference
 * data (categories, cities) is stored with one column per locale rather than pulled
 * through a translation service, since the set is small, curated by us, and changes
 * rarely — a lookup table would be over-engineering for ~20 rows.
 */
export const SUPPORTED_LOCALES = ['tj', 'ru', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Case-insensitive; anything unrecognised (missing header, bad value) falls back to English. */
export const parseLocale = (value: string | undefined | null): Locale => {
  const normalized = value?.trim().toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(normalized ?? '')
    ? (normalized as Locale)
    : DEFAULT_LOCALE;
};

/**
 * `name` is always the English column, kept required at the schema level so it can
 * serve as the fallback when a `tj`/`ru` translation has not been entered yet — a
 * half-translated row still reads correctly, just not fully localized.
 */
export const localize = (
  base: string,
  tj: string | null | undefined,
  ru: string | null | undefined,
  locale: Locale,
): string => {
  if (locale === 'tj') return tj ?? base;
  if (locale === 'ru') return ru ?? base;
  return base;
};

export const localizeNullable = (
  base: string | null | undefined,
  tj: string | null | undefined,
  ru: string | null | undefined,
  locale: Locale,
): string | null => {
  if (locale === 'tj') return tj ?? base ?? null;
  if (locale === 'ru') return ru ?? base ?? null;
  return base ?? null;
};
