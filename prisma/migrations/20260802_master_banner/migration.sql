-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN "banner_file_id" UUID;

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_banner_file_id_fkey" FOREIGN KEY ("banner_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
