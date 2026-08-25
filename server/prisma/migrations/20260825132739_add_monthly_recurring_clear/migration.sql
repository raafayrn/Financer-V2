-- CreateTable
CREATE TABLE "MonthlyRecurringClear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "clearedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyRecurringClear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyRecurringClear_userId_idx" ON "MonthlyRecurringClear"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecurringClear_userId_year_month_key" ON "MonthlyRecurringClear"("userId", "year", "month");
