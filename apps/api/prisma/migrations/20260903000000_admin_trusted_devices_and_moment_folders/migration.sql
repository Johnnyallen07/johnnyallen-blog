-- Admin trusted-device sessions are independent from short-lived access JWTs.
CREATE TABLE "AdminTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "deviceSignature" TEXT NOT NULL,
    "lastIp" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminTrustedDevice_tokenHash_key" ON "AdminTrustedDevice"("tokenHash");
CREATE INDEX "AdminTrustedDevice_userId_revokedAt_expiresAt_idx" ON "AdminTrustedDevice"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AdminTrustedDevice_expiresAt_idx" ON "AdminTrustedDevice"("expiresAt");
ALTER TABLE "AdminTrustedDevice" ADD CONSTRAINT "AdminTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing categories become root folders. Slugs are no longer part of the model.
ALTER TABLE "MomentCategory" DROP CONSTRAINT IF EXISTS "MomentCategory_name_key";
ALTER TABLE "MomentCategory" DROP CONSTRAINT IF EXISTS "MomentCategory_slug_key";
DROP INDEX IF EXISTS "MomentCategory_name_key";
DROP INDEX IF EXISTS "MomentCategory_slug_key";
ALTER TABLE "MomentCategory" DROP COLUMN "slug";
ALTER TABLE "MomentCategory" ADD COLUMN "parentId" TEXT;
ALTER TABLE "MomentCategory" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "MomentCategory" ADD CONSTRAINT "MomentCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MomentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MomentCategory_parentId_trashedAt_name_idx" ON "MomentCategory"("parentId", "trashedAt", "name");
CREATE UNIQUE INDEX "MomentCategory_active_root_name_key" ON "MomentCategory" (LOWER("name")) WHERE "parentId" IS NULL AND "trashedAt" IS NULL;
CREATE UNIQUE INDEX "MomentCategory_active_child_name_key" ON "MomentCategory" ("parentId", LOWER("name")) WHERE "parentId" IS NOT NULL AND "trashedAt" IS NULL;

ALTER TABLE "MomentAsset" ADD COLUMN "trashedAt" TIMESTAMP(3);
DROP INDEX IF EXISTS "MomentAsset_relativePath_checksum_key";
CREATE INDEX "MomentAsset_relativePath_checksum_idx" ON "MomentAsset"("relativePath", "checksum");
CREATE INDEX "MomentAsset_categoryId_status_trashedAt_idx" ON "MomentAsset"("categoryId", "status", "trashedAt");
