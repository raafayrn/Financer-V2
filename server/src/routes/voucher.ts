import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { budgetUpsertSchema } from '../validation/schemas';
import { isValidYearMonth } from '../lib/month';
import { centsToReais, reaisToCents } from '../lib/money';

export const voucherRouter = Router();

voucherRouter.use(requireAuth);

function parseParams(year: string, month: string): { year: number; month: number } {
  const y = Number(year);
  const m = Number(month);
  if (!isValidYearMonth(y, m)) {
    throw new HttpError(400, 'Ano/mês inválidos.');
  }
  return { year: y, month: m };
}

// Vale-alimentação (VR) fixo de um mês específico. Retorna amount 0 quando não definido.
voucherRouter.get(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const voucher = await prisma.monthlyVoucher.findUnique({
      where: { userId_year_month: { userId: req.userId!, year, month } },
    });
    res.json({
      year,
      month,
      amount: voucher ? centsToReais(voucher.amount) : 0,
    });
  }),
);

// Define/atualiza o VR do mês (upsert).
voucherRouter.put(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const { amount } = parseBody(budgetUpsertSchema, req.body);
    const cents = reaisToCents(amount);

    const voucher = await prisma.monthlyVoucher.upsert({
      where: { userId_year_month: { userId: req.userId!, year, month } },
      create: { userId: req.userId!, year, month, amount: cents },
      update: { amount: cents },
    });

    res.json({ year, month, amount: centsToReais(voucher.amount) });
  }),
);
