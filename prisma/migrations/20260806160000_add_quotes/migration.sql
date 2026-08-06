-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'QUOTE_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE 'QUOTE_RESPONDED';
ALTER TYPE "notification_type" ADD VALUE 'QUOTE_DECLINED';

-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('PENDING', 'RESPONDED', 'DECLINED');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "client_profile_id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "service_id" UUID,
    "description" VARCHAR(1000) NOT NULL,
    "status" "quote_status" NOT NULL DEFAULT 'PENDING',
    "estimated_price" DECIMAL(12,2),
    "price_type" "price_type",
    "master_note" VARCHAR(1000),
    "decline_reason" VARCHAR(500),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_client_profile_id_created_at_idx" ON "quotes"("client_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "quotes_master_profile_id_status_created_at_idx" ON "quotes"("master_profile_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
