-- CreateTable
CREATE TABLE "UserBackground" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'aurora',
    "image" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserBackground_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBackground_userId_key" ON "UserBackground"("userId");
