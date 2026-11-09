-- AlterTable
ALTER TABLE "Document" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "pinnedAt" DATETIME;
-- AlterTable
ALTER TABLE "HtmlPreview" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HtmlPreview" ADD COLUMN "pinnedAt" DATETIME;
