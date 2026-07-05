-- 图片乐谱支持：fileType 区分 pdf/images，pages 按顺序存每页图片 [{ key, url, size? }]
ALTER TABLE "MusicScore" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE "MusicScore" ADD COLUMN "pages" JSONB;
