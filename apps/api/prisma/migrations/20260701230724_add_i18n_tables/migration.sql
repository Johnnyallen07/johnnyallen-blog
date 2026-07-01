-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('MACHINE', 'REVIEWED');

-- CreateTable
CREATE TABLE "UiMessage" (
    "id" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "description" TEXT,
    "locations" TEXT[],
    "orphaned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UiMessageTranslation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'MACHINE',
    "sourceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiMessageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTranslation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'MACHINE',
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UiMessage_app_orphaned_idx" ON "UiMessage"("app", "orphaned");

-- CreateIndex
CREATE UNIQUE INDEX "UiMessage_app_namespace_key_key" ON "UiMessage"("app", "namespace", "key");

-- CreateIndex
CREATE INDEX "UiMessageTranslation_locale_status_idx" ON "UiMessageTranslation"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UiMessageTranslation_messageId_locale_key" ON "UiMessageTranslation"("messageId", "locale");

-- CreateIndex
CREATE INDEX "ContentTranslation_entityType_locale_idx" ON "ContentTranslation"("entityType", "locale");

-- CreateIndex
CREATE INDEX "ContentTranslation_locale_status_idx" ON "ContentTranslation"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTranslation_entityType_entityId_field_locale_key" ON "ContentTranslation"("entityType", "entityId", "field", "locale");

-- AddForeignKey
ALTER TABLE "UiMessageTranslation" ADD CONSTRAINT "UiMessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "UiMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
