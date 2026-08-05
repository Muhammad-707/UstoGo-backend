-- §6.8 (MASTER_PROMPT.md): report-and-block between users.

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('SPAM', 'FRAUD', 'ABUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'REPORT_RESOLVED';

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "type" "report_type" NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "admin_note" VARCHAR(1000),
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_reported_user_id_status_idx" ON "reports"("reported_user_id", "status");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
