-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'AUDIO';

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "musician" TEXT NOT NULL,
    "performer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "series" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MusicTrack_musician_idx" ON "MusicTrack"("musician");

-- CreateIndex
CREATE INDEX "MusicTrack_category_idx" ON "MusicTrack"("category");

-- CreateIndex
CREATE INDEX "MusicTrack_order_idx" ON "MusicTrack"("order");
