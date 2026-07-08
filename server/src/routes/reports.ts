import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { centsToReais } from '../lib/money';
import { currentYearMonth } from '../lib/month';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

/**
 * Comparativo mês a mês: gasto total e orçamento de cada mês de um ano.
 * GET /api/reports/monthly?year=2026
 */
reportsRouter.get(
  '/monthly',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const year =
      req.query.year !== undefined ? Number(req.query.year) : currentYearMonth().year;

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      res.status(400).json({ error: 'Parâmetro year inválido.' });
      return;
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const [expenses, budgets] = await Promise.all([
      prisma.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { amount: true, date: true },
      }),
      prisma.monthlyBudget.findMany({
        where: { userId, year },
        select: { month: true, amount: true },
      }),
    ]);

    const spentByMonth = new Array(12).fill(0);
    for (const e of expenses) {
      spentByMonth[e.date.getUTCMonth()] += e.amount;
    }
    const budgetByMonth = new Array(12).fill(0);
    for (const b of budgets) {
      budgetByMonth[b.month - 1] = b.amount;
    }

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      spent: centsToReais(spentByMonth[i]),
      budget: centsToReais(budgetByMonth[i]),
    }));

    res.json({ year, months });
  }),
);

/**
 * Visão completa do ano: gasto/renda/orçamento por mês, gasto por categoria,
 * maiores despesas e métricas agregadas (taxa de economia, média mensal etc).
 * GET /api/reports/overview?year=2026
 */
reportsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const year =
      req.query.year !== undefined ? Number(req.query.year) : currentYearMonth().year;

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      res.status(400).json({ error: 'Parâmetro year inválido.' });
      return;
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const [expenses, budgets, salaries, vouchers, incomes, categories] = await Promise.all([
      prisma.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { id: true, amount: true, date: true, categoryId: true, recurring: true, description: true },
      }),
      prisma.monthlyBudget.findMany({ where: { userId, year }, select: { month: true, amount: true } }),
      prisma.monthlySalary.findMany({ where: { userId, year }, select: { month: true, amount: true } }),
      prisma.monthlyVoucher.findMany({ where: { userId, year }, select: { month: true, amount: true } }),
      prisma.income.findMany({ where: { userId, date: { gte: start, lt: end } }, select: { amount: true, date: true } }),
      prisma.category.findMany({ where: { userId }, select: { id: true, name: true, color: true } }),
    ]);

    const spentByMonth = new Array(12).fill(0);
    const fixedByMonth = new Array(12).fill(0);
    for (const e of expenses) {
      const m = e.date.getUTCMonth();
      spentByMonth[m] += e.amount;
      if (e.recurring) fixedByMonth[m] += e.amount;
    }
    const budgetByMonth = new Array(12).fill(0);
    for (const b of budgets) budgetByMonth[b.month - 1] = b.amount;
    const salaryByMonth = new Array(12).fill(0);
    for (const s of salaries) salaryByMonth[s.month - 1] = s.amount;
    const voucherByMonth = new Array(12).fill(0);
    for (const v of vouchers) voucherByMonth[v.month - 1] = v.amount;
    const extraIncomeByMonth = new Array(12).fill(0);
    for (const i of incomes) extraIncomeByMonth[i.date.getUTCMonth()] += i.amount;

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      spent: centsToReais(spentByMonth[i]),
      budget: centsToReais(budgetByMonth[i]),
      income: centsToReais(salaryByMonth[i] + voucherByMonth[i] + extraIncomeByMonth[i]),
      fixed: centsToReais(fixedByMonth[i]),
    }));

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const totalSpentYear = expenses.reduce((s, e) => s + e.amount, 0);

    const spentByCategory = new Map<string | null, number>();
    for (const e of expenses) {
      const key = e.categoryId ?? null;
      spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + e.amount);
    }
    const byCategory = Array.from(spentByCategory.entries())
      .map(([categoryId, spent]) => {
        const info = categoryId ? categoryById.get(categoryId) : undefined;
        return {
          categoryId,
          categoryName: info?.name ?? 'Sem categoria',
          color: info?.color ?? '#94a3b8',
          spent: centsToReais(spent),
          percent: totalSpentYear > 0 ? spent / totalSpentYear : 0,
        };
      })
      .sort((a, b) => b.spent - a.spent);

    const topExpenses = [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        description: e.description,
        amount: centsToReais(e.amount),
        date: e.date.toISOString().slice(0, 10),
        categoryName: e.categoryId ? categoryById.get(e.categoryId)?.name ?? 'Sem categoria' : 'Sem categoria',
      }));

    const totalIncomeYear =
      salaryByMonth.reduce((s, v) => s + v, 0) +
      voucherByMonth.reduce((s, v) => s + v, 0) +
      extraIncomeByMonth.reduce((s, v) => s + v, 0);
    const recurringTotal = fixedByMonth.reduce((s, v) => s + v, 0);
    const monthsOverBudget = months.filter((m) => m.budget > 0 && m.spent > m.budget).length;

    // Ano corrente: só os meses já decorridos entram na média (evita subestimar
    // a média mensal em um ano ainda incompleto). Anos passados usam os 12 meses.
    const { year: currentYear, month: currentMonth } = currentYearMonth();
    const elapsedMonths = year === currentYear ? currentMonth : year < currentYear ? 12 : 0;

    res.json({
      year,
      months,
      byCategory,
      topExpenses,
      totals: {
        spentYear: centsToReais(totalSpentYear),
        incomeYear: centsToReais(totalIncomeYear),
        avgMonthlySpent: elapsedMonths > 0 ? centsToReais(totalSpentYear / elapsedMonths) : 0,
        savingsRate: totalIncomeYear > 0 ? (totalIncomeYear - totalSpentYear) / totalIncomeYear : 0,
        recurringMonthlyAvg: elapsedMonths > 0 ? centsToReais(recurringTotal / elapsedMonths) : 0,
        expenseCount: expenses.length,
        monthsOverBudget,
      },
    });
  }),
);
