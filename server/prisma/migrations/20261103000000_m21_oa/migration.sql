-- CreateTable
CREATE TABLE "oa_employees" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "hireDate" TEXT,
    "annualAdjustment" DECIMAL NOT NULL DEFAULT 0,
    "compAdjustment" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "oa_holidays" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isWorkday" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "oa_leave_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'full',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "oa_leave_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "oa_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oa_overtime_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "workDate" TEXT NOT NULL,
    "hours" DECIMAL NOT NULL,
    "days" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oa_overtime_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "oa_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oa_memos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "memoDate" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "oa_memos_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "oa_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oa_operation_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operator" TEXT NOT NULL DEFAULT '人事管理员',
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER,
    "detail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "oa_employees_name_key" ON "oa_employees"("name");

-- CreateIndex
CREATE UNIQUE INDEX "oa_holidays_date_region_key" ON "oa_holidays"("date", "region");

-- CreateIndex
CREATE INDEX "oa_leave_records_employeeId_idx" ON "oa_leave_records"("employeeId");

-- CreateIndex
CREATE INDEX "oa_overtime_records_employeeId_idx" ON "oa_overtime_records"("employeeId");

-- CreateIndex
CREATE INDEX "oa_memos_employeeId_idx" ON "oa_memos"("employeeId");
