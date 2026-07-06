-- CreateTable
CREATE TABLE "MonthlyVoucher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyVoucher_userId_idx" ON "MonthlyVoucher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyVoucher_userId_year_month_key" ON "MonthlyVoucher"("userId", "year", "month");
