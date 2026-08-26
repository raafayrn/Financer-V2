-- CreateTable
CREATE TABLE "ExpenseIngestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER,
    "merchant" TEXT NOT NULL,
    "categoryId" TEXT,
    "suggestedCategory" TEXT,
    "occurredAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transactionType" TEXT NOT NULL DEFAULT 'unknown',
    "parseConfidence" TEXT NOT NULL DEFAULT 'medium',
    "rawPayload" TEXT NOT NULL,
    "mergedFrom" TEXT NOT NULL DEFAULT '[]',
    "expenseId" TEXT,
    "incomeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseIngestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseIngestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngestToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExpenseIngestion_userId_status_occurredAt_idx" ON "ExpenseIngestion"("userId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "ExpenseIngestion_userId_occurredAt_idx" ON "ExpenseIngestion"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestToken_tokenHash_key" ON "IngestToken"("tokenHash");

-- CreateIndex
CREATE INDEX "IngestToken_userId_idx" ON "IngestToken"("userId");
