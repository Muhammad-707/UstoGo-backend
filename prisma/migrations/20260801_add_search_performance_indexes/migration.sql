-- Performance (F-08 search hot path, k6/search.js): additive indexes only — nothing
-- is dropped, so this migration cannot regress a running query. The three composite
-- indexes on master_profiles put the mandatory approval/active filter first and the
-- sort column second, so `GET /masters` walks one composite index in order instead of
-- scanning and sorting every approved master; the deletedAt-covering index makes the
-- pagination count an index-only scan (measured at 50,000 masters: data query 39ms →
-- 0.2ms, count 16ms → 5.8ms). The GIN trigram index on display_name serves the admin
-- masters listing's `ILIKE '%…%'` search (measured 0.5ms vs a sequential scan).
--
-- NOTE: `master_profiles.search_vector` is a generated column added by raw SQL in
-- 20260729204719_add_schedule_and_search_vector and deliberately absent from
-- schema.prisma (Prisma's diff cannot see it). Its drop appears nowhere here — the
-- generated migration was hand-edited exactly as STATUS.md §2 documents for every
-- migration since F-12.

-- CreateIndex
CREATE INDEX "master_profiles_approval_status_is_active_created_at_idx" ON "master_profiles"("approval_status", "is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "master_profiles_approval_status_is_active_rating_average_idx" ON "master_profiles"("approval_status", "is_active", "rating_average" DESC);

-- CreateIndex
CREATE INDEX "master_profiles_approval_status_is_active_deleted_at_idx" ON "master_profiles"("approval_status", "is_active", "deleted_at");

-- Admin masters listing (`ILIKE` on display_name, API.md §12) — pg_trgm is already
-- enabled at the datasource level (schema.prisma datasource block), so only the index
-- is needed. Cannot be expressed in Prisma (no GIN opclass support), so it lives in
-- raw SQL exactly like the search_vector column above.
CREATE INDEX "master_profiles_display_name_trgm_idx" ON "master_profiles" USING GIN ("display_name" gin_trgm_ops);
