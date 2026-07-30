-- `master_profiles.search_vector` is a generated column outside Prisma's schema
-- (added by raw SQL in 20260729204719_add_schedule_and_search_vector, same reason
-- documented there and in 20260729214811_booking_review_notification and
-- 20260729233750_add_chat). `prisma migrate dev` again proposed dropping it here
-- because it is invisible to the schema diff; that drop has been removed by hand —
-- this migration adds only the F-14 banners table.

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(500),
    "image_file_id" UUID NOT NULL,
    "link_url" VARCHAR(500),
    "position" "banner_position" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_position_is_active_sort_order_idx" ON "banners"("position", "is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
