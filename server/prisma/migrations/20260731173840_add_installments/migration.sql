-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "installmentGroupId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "installmentNo" INTEGER;
ALTER TABLE "Expense" ADD COLUMN "installmentTotal" INTEGER;

-- CreateIndex
CREATE INDEX "Expense_userId_installmentGroupId_idx" ON "Expense"("userId", "installmentGroupId");
