-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "avatar_file_id" UUID;

-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN     "avatar_file_id" UUID;

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "bucket" VARCHAR(100) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "purpose" "file_purpose" NOT NULL,
    "uploaded_by_user_id" UUID,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_key_key" ON "files"("key");

-- CreateIndex
CREATE INDEX "files_uploaded_by_user_id_idx" ON "files"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "files_is_confirmed_created_at_idx" ON "files"("is_confirmed", "created_at");

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariants expressible as database constraints (PROJECT_RULES.md §6.2).
-- ---------------------------------------------------------------------------

-- A zero-byte upload is never a real file, and the size is what the MIME/size
-- verification at confirmation time compares against.
ALTER TABLE "files"
  ADD CONSTRAINT "ck_files_size_bytes_positive"
  CHECK ("size_bytes" > 0);
