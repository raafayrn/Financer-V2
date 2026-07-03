import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { budgetUpsertSchema } from '../validation/schemas';
import { isValidYearMonth } from '../lib/month';
import { centsToReais, reaisToCents } from '../lib/money';

export const salaryRouter = Router();

salaryRouter.use(requireAuth);

function parseParams(year: string, month: string): { year: number; month: number } {
  const y = Number(year);
  const m = Number(month);
  if (!isValidYearMonth(y, m)) {
    throw new HttpError(400, 'Ano/mês inválidos.');
  }
  return { year: y, month: m };
}

// Salário fixo de um mês específico. Retorna amount 0 quando não definido.
salaryRouter.get(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const salary = await prisma.monthlySalary.findUnique({
      where: { userId_year_month: { userId: req.userId!, year, month } },
    });
    res.json({
      year,
      month,
      amount: salary ? centsToReais(salary.amount) : 0,
    });
  }),
);

// Define/atualiza o salário do mês (upsert).
salaryRouter.put(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const { amount } = parseBody(budgetUpsertSchema, req.body);
    const cents = reaisToCents(amount);

    const salary = await prisma.monthlySalary.upsert({
      where: { userId_year_month: { userId: req.userId!, year, month } },
      create: { userId: req.userId!, year, month, amount: cents },
      update: { amount: cents },
    });

    res.json({ year, month, amount: centsToReais(salary.amount) });
  }),
);
