CREATE TYPE "MomentVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "MomentAssetStatus" AS ENUM ('READY', 'ARCHIVED');

CREATE TABLE "MomentCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "totpSecretEnc" TEXT,
  "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "recoveryCodeHashes" TEXT[] NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastTotpStep" BIGINT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MomentCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MomentCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "color" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MomentCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MomentAsset" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "width" INTEGER,
  "height" INTEGER,
  "tags" TEXT[] NOT NULL,
  "visibility" "MomentVisibility" NOT NULL DEFAULT 'PRIVATE',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "MomentAssetStatus" NOT NULL DEFAULT 'READY',
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MomentAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MomentSyncToken" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MomentSyncToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MomentAuditLog" (
  "id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "assetId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MomentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MomentCredential_userId_key" ON "MomentCredential"("userId");
CREATE UNIQUE INDEX "MomentCategory_name_key" ON "MomentCategory"("name");
CREATE UNIQUE INDEX "MomentCategory_slug_key" ON "MomentCategory"("slug");
CREATE INDEX "MomentCategory_order_idx" ON "MomentCategory"("order");
CREATE UNIQUE INDEX "MomentAsset_objectKey_key" ON "MomentAsset"("objectKey");
CREATE UNIQUE INDEX "MomentAsset_relativePath_checksum_key" ON "MomentAsset"("relativePath", "checksum");
CREATE INDEX "MomentAsset_visibility_status_capturedAt_idx" ON "MomentAsset"("visibility", "status", "capturedAt");
CREATE INDEX "MomentAsset_categoryId_status_idx" ON "MomentAsset"("categoryId", "status");
CREATE INDEX "MomentAsset_checksum_idx" ON "MomentAsset"("checksum");
CREATE UNIQUE INDEX "MomentSyncToken_tokenHash_key" ON "MomentSyncToken"("tokenHash");
CREATE INDEX "MomentSyncToken_revokedAt_expiresAt_idx" ON "MomentSyncToken"("revokedAt", "expiresAt");
CREATE INDEX "MomentAuditLog_createdAt_idx" ON "MomentAuditLog"("createdAt");
CREATE INDEX "MomentAuditLog_assetId_createdAt_idx" ON "MomentAuditLog"("assetId", "createdAt");

ALTER TABLE "MomentCredential" ADD CONSTRAINT "MomentCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MomentAsset" ADD CONSTRAINT "MomentAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MomentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
