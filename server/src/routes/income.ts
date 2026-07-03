import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { centsToReais, reaisToCents } from '../lib/money';
import { monthRange } from '../lib/month';
import { readYearMonth } from '../lib/query';
import { incomeCreateSchema, incomeUpdateSchema } from '../validation/schemas';

export const incomeRouter = Router();

incomeRouter.use(requireAuth);

async function assertOwnedAccount(
  userId: string,
  accountId: string | null | undefined,
): Promise<void> {
  if (!accountId) return;
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new HttpError(400, 'Conta inválida.');
}

function parseIncomeDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

function serializeIncome(i: {
  id: string;
  description: string;
  amount: number;
  date: Date;
  accountId: string | null;
}) {
  return {
    id: i.id,
    description: i.description,
    amount: centsToReais(i.amount),
    date: i.date.toISOString().slice(0, 10),
    accountId: i.accountId,
  };
}

// Lista os lançamentos de renda de um mês (year/month na query; padrão = mês atual).
incomeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month } = readYearMonth(req);
    const { start, end } = monthRange(year, month);
    const incomes = await prisma.income.findMany({
      where: { userId: req.userId!, date: { gte: start, lt: end } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(incomes.map(serializeIncome));
  }),
);

incomeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(incomeCreateSchema, req.body);
    await assertOwnedAccount(req.userId!, data.accountId ?? null);

    const income = await prisma.income.create({
      data: {
        userId: req.userId!,
        description: data.description,
        amount: reaisToCents(data.amount),
        date: parseIncomeDate(data.date),
        accountId: data.accountId ?? null,
      },
    });
    res.status(201).json(serializeIncome(income));
  }),
);

incomeRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(incomeUpdateSchema, req.body);
    const income = await prisma.income.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!income) throw new HttpError(404, 'Lançamento não encontrado.');

    if (data.accountId !== undefined) {
      await assertOwnedAccount(req.userId!, data.accountId);
    }

    const updated = await prisma.income.update({
      where: { id: income.id },
      data: {
        description: data.description,
        amount: data.amount !== undefined ? reaisToCents(data.amount) : undefined,
        date: data.date !== undefined ? parseIncomeDate(data.date) : undefined,
        accountId: data.accountId,
      },
    });
    res.json(serializeIncome(updated));
  }),
);

incomeRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const income = await prisma.income.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!income) throw new HttpError(404, 'Lançamento não encontrado.');
    await prisma.income.delete({ where: { id: income.id } });
    res.status(204).end();
  }),
);
