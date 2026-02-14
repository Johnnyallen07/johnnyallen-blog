-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesItem" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "postId" TEXT,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE INDEX "Series_slug_idx" ON "Series"("slug");

-- CreateIndex
CREATE INDEX "Series_categoryId_idx" ON "Series"("categoryId");

-- CreateIndex
CREATE INDEX "SeriesItem_seriesId_idx" ON "SeriesItem"("seriesId");

-- CreateIndex
CREATE INDEX "SeriesItem_parentId_idx" ON "SeriesItem"("parentId");

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesItem" ADD CONSTRAINT "SeriesItem_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesItem" ADD CONSTRAINT "SeriesItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesItem" ADD CONSTRAINT "SeriesItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SeriesItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
