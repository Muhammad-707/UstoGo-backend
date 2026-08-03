-- Adds Tajik/Russian display columns for reference data (categories, cities,
-- districts) so the storefront can render translated names instead of always
-- falling back to the English `name`/`description`. Nullable everywhere:
-- a missing translation falls back to the base column rather than 404ing.

ALTER TABLE "categories" ADD COLUMN "name_tj" VARCHAR(150);
ALTER TABLE "categories" ADD COLUMN "name_ru" VARCHAR(150);
ALTER TABLE "categories" ADD COLUMN "description_tj" TEXT;
ALTER TABLE "categories" ADD COLUMN "description_ru" TEXT;

ALTER TABLE "cities" ADD COLUMN "name_tj" VARCHAR(150);
ALTER TABLE "cities" ADD COLUMN "name_ru" VARCHAR(150);

ALTER TABLE "districts" ADD COLUMN "name_ru" VARCHAR(150);
