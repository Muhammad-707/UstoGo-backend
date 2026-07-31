-- AlterEnum
ALTER TYPE "file_purpose" ADD VALUE 'PORTFOLIO_IMAGE';

-- CreateTable
CREATE TABLE "portfolio_images" (
    "id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "caption" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "portfolio_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_images_master_profile_id_deleted_at_sort_order_idx" ON "portfolio_images"("master_profile_id", "deleted_at", "sort_order");

-- AddForeignKey
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
