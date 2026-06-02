-- CreateTable
CREATE TABLE IF NOT EXISTS "MusicScore" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "composer" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicScore_instrument_idx" ON "MusicScore"("instrument");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicScore_order_idx" ON "MusicScore"("order");
