import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { readYearMonth } from '../lib/query';
import { monthRange } from '../lib/month';
import { computeSummary, computeAccountBreakdown, computeIncomeSummary, type AccountKind } from '../lib/budget';
import { centsToReais } from '../lib/money';
import { ensureAccountsForUser } from '../lib/accounts';

export const summaryRouter = Router();

summaryRouter.use(requireAuth);

// Resumo do mês: orçamento, renda, gasto por conta, sobra e saldo da carteira.
summaryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month } = readYearMonth(req);
    const { start, end } = monthRange(year, month);
    const userId = req.userId!;

    await ensureAccountsForUser(prisma, userId);

    const [budget, salary, expenses, incomes, categories, accounts, walletIncomeAgg, walletExpenseAgg] =
      await Promise.all([
        prisma.monthlyBudget.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.monthlySalary.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.expense.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: { amount: true, categoryId: true, accountId: true, recurring: true },
        }),
        prisma.income.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: { amount: true },
        }),
        prisma.category.findMany({
          where: { userId },
          select: { id: true, name: true, color: true },
        }),
        prisma.account.findMany({ where: { userId } }),
        // Saldo da carteira ACUMULA (não é filtrado por mês).
        prisma.income.aggregate({
          where: { userId, account: { kind: 'WALLET' } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { userId, account: { kind: 'WALLET' } },
          _sum: { amount: true },
        }),
      ]);

    const summary = computeSummary(budget?.amount ?? 0, expenses, categories);
    const income = computeIncomeSummary(salary?.amount ?? 0, incomes);

    const accountKindById = new Map<string, AccountKind>(accounts.map((a) => [a.id, a.kind]));
    const accountBreakdown = computeAccountBreakdown(expenses, accountKindById);

    const walletBalanceCents =
      (walletIncomeAgg._sum.amount ?? 0) - (walletExpenseAgg._sum.amount ?? 0);

    res.json({
      year,
      month,
      // Orçamento (meta opcional definida em Ajustes) — mantido para quem só
      // quer acompanhar limite de gasto, sem usar o modelo de renda.
      budget: centsToReais(summary.budget),
      totalSpent: centsToReais(summary.totalSpent),
      remaining: centsToReais(summary.remaining),
      percentUsed: summary.percentUsed,
      status: summary.status,
      expenseCount: expenses.length,
      byCategory: summary.byCategory.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        color: c.color,
        spent: centsToReais(c.spent),
      })),
      // Renda do mês (salário fixo + lançamentos avulsos, ex.: vale convertido).
      income: {
        salary: centsToReais(income.salary),
        extra: centsToReais(income.extra),
        total: centsToReais(income.total),
      },
      // Gasto por conta de origem.
      accounts: {
        fixed: centsToReais(accountBreakdown.fixed),
        variable: centsToReais(accountBreakdown.variable),
        foodVoucher: centsToReais(accountBreakdown.foodVoucher),
        wallet: centsToReais(accountBreakdown.wallet),
        total: centsToReais(accountBreakdown.total),
      },
      // Sobra do mês = renda total − gasto total (todas as contas).
      monthSurplus: centsToReais(income.total - accountBreakdown.total),
      // Saldo acumulado da carteira (Pix) — não reseta por mês.
      walletBalance: centsToReais(walletBalanceCents),
    });
  }),
);
