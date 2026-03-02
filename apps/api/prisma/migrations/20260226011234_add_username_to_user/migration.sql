-- AlterTable: make email optional, add username
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Add username column (temporarily nullable for existing rows)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Set username from name for existing users
UPDATE "User" SET "username" = "name" WHERE "username" IS NULL;

-- Make username NOT NULL and UNIQUE
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
