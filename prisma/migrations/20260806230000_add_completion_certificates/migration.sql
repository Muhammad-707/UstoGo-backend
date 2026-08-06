-- CreateTable
CREATE TABLE "completion_certificates" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "verification_code" VARCHAR(20) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "completion_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "completion_certificates_booking_id_key" ON "completion_certificates"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "completion_certificates_verification_code_key" ON "completion_certificates"("verification_code");

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
