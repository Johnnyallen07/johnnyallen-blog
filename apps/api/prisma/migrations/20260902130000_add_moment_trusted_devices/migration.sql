CREATE TABLE "MomentTrustedDevice" (
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

  CONSTRAINT "MomentTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MomentTrustedDevice_userId_revokedAt_expiresAt_idx"
  ON "MomentTrustedDevice"("userId", "revokedAt", "expiresAt");
CREATE INDEX "MomentTrustedDevice_expiresAt_idx"
  ON "MomentTrustedDevice"("expiresAt");

ALTER TABLE "MomentTrustedDevice"
  ADD CONSTRAINT "MomentTrustedDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
