-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'CLIENT', 'MASTER');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "price_type" AS ENUM ('FIXED', 'HOURLY', 'FROM');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_MASTER', 'CANCELLED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('CLIENT', 'MASTER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('BOOKING_CREATED', 'BOOKING_ACCEPTED', 'BOOKING_REJECTED', 'BOOKING_STARTED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED', 'BOOKING_EXPIRED', 'MASTER_APPROVED', 'MASTER_REJECTED', 'MASTER_DEACTIVATED', 'REVIEW_RECEIVED', 'REVIEW_REPLIED', 'REVIEW_INVITATION', 'MESSAGE_RECEIVED', 'SYSTEM_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "banner_position" AS ENUM ('HOME_TOP', 'HOME_MIDDLE', 'CATEGORY_TOP');

-- CreateEnum
CREATE TYPE "file_purpose" AS ENUM ('AVATAR', 'CERTIFICATE', 'BANNER', 'MESSAGE_ATTACHMENT', 'CATEGORY_ICON');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('MASTER_APPROVED', 'MASTER_REJECTED', 'MASTER_ACTIVATED', 'MASTER_DEACTIVATED', 'USER_BLOCKED', 'USER_UNBLOCKED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DEACTIVATED', 'SERVICE_DEACTIVATED', 'BOOKING_FORCE_CANCELLED', 'REVIEW_HIDDEN', 'REVIEW_UNHIDDEN', 'BANNER_CREATED', 'BANNER_UPDATED', 'BANNER_DELETED', 'NOTIFICATION_BROADCAST', 'CONVERSATION_ACCESSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(72) NOT NULL,
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "city_id" UUID,
    "default_address" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "bio" TEXT,
    "years_of_experience" SMALLINT NOT NULL DEFAULT 0,
    "city_id" UUID NOT NULL,
    "service_radius_km" SMALLINT NOT NULL DEFAULT 15,
    "timezone" VARCHAR(64) NOT NULL,
    "approval_status" "approval_status" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" VARCHAR(500),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "completed_bookings_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "master_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "region" VARCHAR(150),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(100),
    "device_id" VARCHAR(200),
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_user_id_key" ON "client_profiles"("user_id");

-- CreateIndex
CREATE INDEX "client_profiles_city_id_idx" ON "client_profiles"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_profiles_user_id_key" ON "master_profiles"("user_id");

-- CreateIndex
CREATE INDEX "master_profiles_approval_status_is_active_idx" ON "master_profiles"("approval_status", "is_active");

-- CreateIndex
CREATE INDEX "master_profiles_city_id_idx" ON "master_profiles"("city_id");

-- CreateIndex
CREATE INDEX "master_profiles_rating_average_idx" ON "master_profiles"("rating_average" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_key" ON "cities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL for constraints Prisma cannot express (DATABASE.md §15.5).
-- ---------------------------------------------------------------------------

-- §3.1: email and phone are unique among *live* rows only, so soft-deleting an
-- account releases its address for re-registration. Prisma has no syntax for a
-- partial unique index, which is why neither column is declared @unique.
CREATE UNIQUE INDEX "uq_users_email_active"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_users_phone_active"
  ON "users" ("phone")
  WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;

-- §3.3: invariants expressible as database constraints are expressed as database
-- constraints (PROJECT_RULES §6.2). The denormalised aggregates are guarded here
-- so a bug in the recalculation path fails loudly instead of storing nonsense.
ALTER TABLE "master_profiles"
  ADD CONSTRAINT "ck_master_profiles_years_of_experience"
  CHECK ("years_of_experience" BETWEEN 0 AND 70);

ALTER TABLE "master_profiles"
  ADD CONSTRAINT "ck_master_profiles_rating_average"
  CHECK ("rating_average" BETWEEN 0 AND 5);

ALTER TABLE "master_profiles"
  ADD CONSTRAINT "ck_master_profiles_rating_count"
  CHECK ("rating_count" >= 0);

ALTER TABLE "master_profiles"
  ADD CONSTRAINT "ck_master_profiles_completed_bookings_count"
  CHECK ("completed_bookings_count" >= 0);
