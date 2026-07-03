import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { serializeExpense } from '../lib/serialize';
import { reaisToCents } from '../lib/money';
import { monthRange } from '../lib/month';
import { readYearMonth } from '../lib/query';
import { expenseCreateSchema, expenseUpdateSchema } from '../validation/schemas';

export const expensesRouter = Router();

expensesRouter.use(requireAuth);

/** Garante que a categoria (se informada) pertence ao usuário. */
async function assertOwnedCategory(
  userId: string,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });
  if (!category) throw new HttpError(400, 'Categoria inválida.');
}

/** Garante que a conta (se informada) pertence ao usuário. */
async function assertOwnedAccount(
  userId: string,
  accountId: string | null | undefined,
): Promise<void> {
  if (!accountId) return;
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new HttpError(400, 'Conta inválida.');
}

/** Converte "AAAA-MM-DD" para um Date fixo às 12:00 UTC (evita drift de fuso). */
function parseExpenseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

// Lista as despesas de um mês (year/month na query; padrão = mês atual).
expensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month } = readYearMonth(req);
    const { start, end } = monthRange(year, month);
    const expenses = await prisma.expense.findMany({
      where: { userId: req.userId!, date: { gte: start, lt: end } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(expenses.map(serializeExpense));
  }),
);

expensesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(expenseCreateSchema, req.body);
    await assertOwnedCategory(req.userId!, data.categoryId ?? null);
    await assertOwnedAccount(req.userId!, data.accountId ?? null);

    const expense = await prisma.expense.create({
      data: {
        userId: req.userId!,
        description: data.description,
        amount: reaisToCents(data.amount),
        date: parseExpenseDate(data.date),
        categoryId: data.categoryId ?? null,
        accountId: data.accountId ?? null,
        recurring: data.recurring ?? false,
      },
    });
    res.status(201).json(serializeExpense(expense));
  }),
);

expensesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(expenseUpdateSchema, req.body);
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!expense) throw new HttpError(404, 'Lançamento não encontrado.');

    if (data.categoryId !== undefined) {
      await assertOwnedCategory(req.userId!, data.categoryId);
    }
    if (data.accountId !== undefined) {
      await assertOwnedAccount(req.userId!, data.accountId);
    }

    const updated = await prisma.expense.update({
      where: { id: expense.id },
      data: {
        description: data.description,
        amount: data.amount !== undefined ? reaisToCents(data.amount) : undefined,
        date: data.date !== undefined ? parseExpenseDate(data.date) : undefined,
        categoryId: data.categoryId,
        accountId: data.accountId,
        recurring: data.recurring,
      },
    });
    res.json(serializeExpense(updated));
  }),
);

expensesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!expense) throw new HttpError(404, 'Lançamento não encontrado.');
    await prisma.expense.delete({ where: { id: expense.id } });
    res.status(204).end();
  }),
);
