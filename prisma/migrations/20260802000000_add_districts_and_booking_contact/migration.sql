-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_city_id_slug_key" ON "districts"("city_id", "slug");

-- CreateIndex
CREATE INDEX "districts_city_id_is_active_name_idx" ON "districts"("city_id", "is_active", "name");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "city_id" UUID,
ADD COLUMN "contact_phone" VARCHAR(20);

-- CreateIndex
CREATE INDEX "bookings_city_id_idx" ON "bookings"("city_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
