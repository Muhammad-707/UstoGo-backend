-- CreateTable
CREATE TABLE "working_days" (
    "id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "working_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_day_off" BOOLEAN NOT NULL,
    "start_time" TIME,
    "end_time" TIME,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "working_days_master_profile_id_weekday_idx" ON "working_days"("master_profile_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_exceptions_master_profile_id_date_key" ON "schedule_exceptions"("master_profile_id", "date");

-- AddForeignKey
ALTER TABLE "working_days" ADD CONSTRAINT "working_days_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DATABASE.md §6.1/§6.2: invariants expressible as database constraints are expressed
-- as database constraints (PROJECT_RULES §6.2).
ALTER TABLE "working_days"
  ADD CONSTRAINT "ck_working_days_time_range"
  CHECK ("end_time" > "start_time");

ALTER TABLE "schedule_exceptions"
  ADD CONSTRAINT "ck_schedule_exceptions_time_range"
  CHECK (
    ("is_day_off" = true AND "start_time" IS NULL AND "end_time" IS NULL)
    OR ("is_day_off" = false AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "end_time" > "start_time")
  );

-- DATABASE.md §3.3: generated, GIN-indexed full-text column. Not modelled as a Prisma
-- field (Prisma cannot express GENERATED ALWAYS AS ... STORED) — queried through
-- $queryRaw in SearchService instead of the generated client.
ALTER TABLE "master_profiles"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("display_name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("bio", '')), 'B')
  ) STORED;

CREATE INDEX "master_profiles_search_vector_idx" ON "master_profiles" USING GIN ("search_vector");
