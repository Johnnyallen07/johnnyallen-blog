/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Post` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add new columns as NULLABLE first to handle existing data
ALTER TABLE "Category" ADD COLUMN "description" TEXT;
ALTER TABLE "Category" ADD COLUMN "icon" TEXT;
ALTER TABLE "Category" ADD COLUMN "slug" TEXT;
ALTER TABLE "Category" ADD COLUMN "thumbnailUrl" TEXT;

ALTER TABLE "Post" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "Post" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "slug" TEXT;
ALTER TABLE "Post" ADD COLUMN "thumbnailUrl" TEXT;

-- Step 2: Populate slugs for existing Category records (convert name to slug format)
UPDATE "Category" 
SET "slug" = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '''', ''), '&', 'and'))
WHERE "slug" IS NULL;

-- Step 3: Populate slugs for existing Post records (use id as fallback since we don't have titles yet)
UPDATE "Post" 
SET "slug" = LOWER(REPLACE(REPLACE(REPLACE(title, ' ', '-'), '''', ''), '&', 'and'))
WHERE "slug" IS NULL;

-- Step 4: Now make slug NOT NULL and add constraints
ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "slug" SET NOT NULL;

-- Step 5: Create indexes
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE INDEX "Post_slug_idx" ON "Post"("slug");
CREATE INDEX "Post_categoryId_idx" ON "Post"("categoryId");
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");
CREATE INDEX "Post_featured_idx" ON "Post"("featured");
