-- AlterTable
ALTER TABLE "MusicTrack" ADD COLUMN     "playCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MusicCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicArtist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicArtist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicCategory_name_key" ON "MusicCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MusicCategory_slug_key" ON "MusicCategory"("slug");

-- CreateIndex
CREATE INDEX "MusicCategory_order_idx" ON "MusicCategory"("order");

-- CreateIndex
CREATE UNIQUE INDEX "MusicArtist_name_key" ON "MusicArtist"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MusicArtist_slug_key" ON "MusicArtist"("slug");

-- CreateIndex
CREATE INDEX "MusicArtist_order_idx" ON "MusicArtist"("order");

-- CreateIndex
CREATE UNIQUE INDEX "MusicSeries_name_key" ON "MusicSeries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MusicSeries_slug_key" ON "MusicSeries"("slug");

-- CreateIndex
CREATE INDEX "MusicSeries_order_idx" ON "MusicSeries"("order");
