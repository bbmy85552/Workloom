-- 公共知识库文档软删除：deletedAt 标记回收站，deletedById 记录删除者
ALTER TABLE "Document" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "deletedById" TEXT;

-- 便于回收站查询与惰性清理
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
