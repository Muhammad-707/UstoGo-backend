-- AlterEnum
ALTER TYPE "file_purpose" ADD VALUE 'BOOKING_ATTACHMENT';

-- CreateTable
CREATE TABLE "booking_attachments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_attachments_booking_id_idx" ON "booking_attachments"("booking_id");

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
