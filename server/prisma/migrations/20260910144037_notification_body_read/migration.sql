-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN "body" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN "readAt" DATETIME;

-- CreateIndex
CREATE INDEX "NotificationLog_userId_readAt_idx" ON "NotificationLog"("userId", "readAt");
