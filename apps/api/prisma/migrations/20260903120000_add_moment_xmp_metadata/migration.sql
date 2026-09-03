ALTER TABLE "MomentAsset" ADD COLUMN "xmpMetadata" JSONB;
ALTER TABLE "MomentAsset" ADD COLUMN "metadataText" TEXT NOT NULL DEFAULT '';
CREATE INDEX "MomentAsset_metadataText_idx" ON "MomentAsset"("metadataText");
