-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN     "whatsapp_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsapp_phone" VARCHAR(20);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "whatsapp_link_clicked_at" TIMESTAMPTZ(3);
