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
