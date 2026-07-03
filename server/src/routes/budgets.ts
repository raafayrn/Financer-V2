import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { budgetUpsertSchema } from '../validation/schemas';
import { isValidYearMonth } from '../lib/month';
import { centsToReais, reaisToCents } from '../lib/money';

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);

function parseParams(year: string, month: string): { year: number; month: number } {
  const y = Number(year);
  const m = Number(month);
  if (!isValidYearMonth(y, m)) {
    throw new HttpError(400, 'Ano/mês inválidos.');
  }
  return { year: y, month: m };
}

// Orçamento de um mês específico. Retorna amount 0 quando não definido.
budgetsRouter.get(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const budget = await prisma.monthlyBudget.findUnique({
      where: { userId_year_month: { userId: req.userId!, year, month } },
    });
    res.json({
      year,
      month,
      amount: budget ? centsToReais(budget.amount) : 0,
    });
  }),
);

// Define/atualiza o orçamento do mês (upsert).
budgetsRouter.put(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const { amount } = parseBody(budgetUpsertSchema, req.body);
    const cents = reaisToCents(amount);

    const budget = await prisma.monthlyBudget.upsert({
      where: { userId_year_month: { userId: req.userId!, year, month } },
      create: { userId: req.userId!, year, month, amount: cents },
      update: { amount: cents },
    });

    res.json({ year, month, amount: centsToReais(budget.amount) });
  }),
);
