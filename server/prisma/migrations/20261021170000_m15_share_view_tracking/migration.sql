-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "trackViews" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShareViewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visibleSec" INTEGER NOT NULL DEFAULT 0,
    "activeSec" INTEGER NOT NULL DEFAULT 0,
    "scrollSec" INTEGER NOT NULL DEFAULT 0,
    "maxScrollDepth" INTEGER NOT NULL DEFAULT 0,
    "userAgent" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "ShareViewSession_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ShareLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareViewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShareViewSession_linkId_startedAt_idx" ON "ShareViewSession"("linkId", "startedAt");
CREATE INDEX "ShareViewSession_userId_idx" ON "ShareViewSession"("userId");
