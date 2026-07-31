import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { serializeExpense } from '../lib/serialize';
import { reaisToCents } from '../lib/money';
import { currentYearMonth, monthRange } from '../lib/month';
import { readYearMonth } from '../lib/query';
import { materializeRecurringExpenses, monthIndex } from '../lib/recurring';
import { buildInstallmentPlan } from '../lib/installments';
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

/**
 * Gera as despesas fixas do mês pedido antes de responder, para que o mês
 * apareça completo já na primeira abertura. É idempotente e não faz nada para
 * meses futuros — o gasto fixo só entra no mês quando o mês chega.
 */
export async function ensureRecurringForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<void> {
  const now = currentYearMonth();
  if (monthIndex(year, month) > monthIndex(now.year, now.month)) return;
  await materializeRecurringExpenses(prisma, userId, year, month);
}

// Lista as despesas de um mês (year/month na query; padrão = mês atual).
expensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month } = readYearMonth(req);
    await ensureRecurringForMonth(req.userId!, year, month);
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
    const userId = req.userId!;
    await assertOwnedCategory(userId, data.categoryId ?? null);
    await assertOwnedAccount(userId, data.accountId ?? null);

    const totalCents = reaisToCents(data.amount);
    const count = data.installments ?? 1;

    // --- Compra parcelada: uma despesa por mês, do mês da compra em diante ---
    if (count > 1) {
      const groupId = randomUUID();
      const plan = buildInstallmentPlan(data.description, totalCents, data.date, count);

      await prisma.expense.createMany({
        data: plan.map((p) => ({
          userId,
          description: p.description,
          amount: p.amount,
          date: parseExpenseDate(p.date),
          categoryId: data.categoryId ?? null,
          accountId: data.accountId ?? null,
          recurring: false,
          installmentGroupId: groupId,
          installmentNo: p.installmentNo,
          installmentTotal: p.installmentTotal,
        })),
      });

      const created = await prisma.expense.findMany({
        where: { userId, installmentGroupId: groupId },
        orderBy: { installmentNo: 'asc' },
      });
      // Devolve a primeira parcela (a que cai no mês em exibição) mais o plano,
      // para o frontend poder avisar "3 parcelas de R$ 200 até setembro".
      res.status(201).json({
        ...serializeExpense(created[0]),
        installmentPlan: created.map(serializeExpense),
      });
      return;
    }

    // --- Compra à vista ---
    const expense = await prisma.expense.create({
      data: {
        userId,
        description: data.description,
        amount: totalCents,
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

/**
 * Exclui um lançamento. Numa compra parcelada, `?group=1` apaga o parcelamento
 * inteiro (todas as parcelas, inclusive as dos meses seguintes) — sem isso,
 * apagar só a parcela do mês deixaria as outras órfãs no futuro.
 */
expensesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, userId } });
    if (!expense) throw new HttpError(404, 'Lançamento não encontrado.');

    if (req.query.group === '1' && expense.installmentGroupId) {
      const { count } = await prisma.expense.deleteMany({
        where: { userId, installmentGroupId: expense.installmentGroupId },
      });
      res.json({ deletedCount: count });
      return;
    }

    await prisma.expense.delete({ where: { id: expense.id } });
    res.status(204).end();
  }),
);
