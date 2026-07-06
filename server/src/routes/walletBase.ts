import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { walletBaseUpsertSchema } from '../validation/schemas';
import { isValidYearMonth } from '../lib/month';
import { centsToReais, reaisToCents } from '../lib/money';

export const walletBaseRouter = Router();

walletBaseRouter.use(requireAuth);

function parseParams(year: string, month: string): { year: number; month: number } {
  const y = Number(year);
  const m = Number(month);
  if (!isValidYearMonth(y, m)) {
    throw new HttpError(400, 'Ano/mês inválidos.');
  }
  return { year: y, month: m };
}

// Saldo base da carteira (Pix) do mês. Retorna amount 0 quando não definido.
walletBaseRouter.get(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const base = await prisma.monthlyWalletBase.findUnique({
      where: { userId_year_month: { userId: req.userId!, year, month } },
    });
    res.json({
      year,
      month,
      amount: base ? centsToReais(base.amount) : 0,
    });
  }),
);

// Define/atualiza o saldo base da carteira do mês (upsert).
walletBaseRouter.put(
  '/:year/:month',
  asyncHandler(async (req, res) => {
    const { year, month } = parseParams(req.params.year, req.params.month);
    const { amount } = parseBody(walletBaseUpsertSchema, req.body);
    const cents = reaisToCents(amount);

    const base = await prisma.monthlyWalletBase.upsert({
      where: { userId_year_month: { userId: req.userId!, year, month } },
      create: { userId: req.userId!, year, month, amount: cents },
      update: { amount: cents },
    });

    res.json({ year, month, amount: centsToReais(base.amount) });
  }),
);
