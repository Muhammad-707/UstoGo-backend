-- CreateTable
CREATE TABLE "quick_replies" (
    "id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_replies_master_profile_id_deleted_at_sort_order_idx" ON "quick_replies"("master_profile_id", "deleted_at", "sort_order");

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
