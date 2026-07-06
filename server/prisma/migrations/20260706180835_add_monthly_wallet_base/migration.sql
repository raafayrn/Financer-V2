-- CreateTable
CREATE TABLE "MonthlyWalletBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyWalletBase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyWalletBase_userId_idx" ON "MonthlyWalletBase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyWalletBase_userId_year_month_key" ON "MonthlyWalletBase"("userId", "year", "month");
