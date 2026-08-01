-- AlterEnum (idempotent): the label was already applied to the production
-- database before this migration was created, so a plain ADD VALUE would fail
-- on the next `prisma migrate deploy`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'notification_type'
      AND pg_enum.enumlabel = 'MASTER_REGISTERED'
  ) THEN
    ALTER TYPE "notification_type" ADD VALUE 'MASTER_REGISTERED';
  END IF;
END $$;
