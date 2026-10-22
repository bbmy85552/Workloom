-- CreateTable
CREATE TABLE "ShareLinkViewer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareLinkViewer_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ShareLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareLinkViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShareLinkViewer_userId_idx" ON "ShareLinkViewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLinkViewer_linkId_userId_key" ON "ShareLinkViewer"("linkId", "userId");
