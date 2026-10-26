-- Merge HTML previews into the knowledge base: folder placement + trash
ALTER TABLE "HtmlPreview" ADD COLUMN "parentId" TEXT;
ALTER TABLE "HtmlPreview" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "HtmlPreview" ADD COLUMN "deletedById" TEXT;
