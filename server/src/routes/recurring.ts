import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { serializeRecurringExpense } from '../lib/serialize';
import { centsToReais, reaisToCents } from '../lib/money';
import { currentYearMonth, isValidYearMonth, monthRange } from '../lib/month';
import { catchUpRecurringExpenses, materializeRecurringExpenses } from '../lib/recurring';
import {
  recurringExpenseCreateSchema,
  recurringExpenseUpdateSchema,
} from '../validation/schemas';

export const recurringRouter = Router();

recurringRouter.use(requireAuth);

/** Garante que a categoria (se informada) pertence ao usuário. */
async function assertOwnedCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const found = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!found) throw new HttpError(400, 'Categoria inválida.');
}

/** Garante que a conta (se informada) pertence ao usuário. */
async function assertOwnedAccount(userId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  const found = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!found) throw new HttpError(400, 'Conta inválida.');
}

// Lista os templates de despesa fixa, com quantas despesas cada um já gerou.
recurringRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const templates = await prisma.recurringExpense.findMany({
      where: { userId: req.userId! },
      orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }, { description: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
    res.json(
      templates.map((t) => ({
        ...serializeRecurringExpense(t),
        generatedCount: t._count.expenses,
      })),
    );
  }),
);

recurringRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(recurringExpenseCreateSchema, req.body);
    const userId = req.userId!;
    await assertOwnedCategory(userId, data.categoryId ?? null);
    await assertOwnedAccount(userId, data.accountId ?? null);

    const now = currentYearMonth();
    const template = await prisma.recurringExpense.create({
      data: {
        userId,
        description: data.description,
        amount: reaisToCents(data.amount),
        dayOfMonth: data.dayOfMonth,
        categoryId: data.categoryId ?? null,
        accountId: data.accountId ?? null,
        startYear: data.startYear ?? now.year,
        startMonth: data.startMonth ?? now.month,
        endYear: data.endYear ?? null,
        endMonth: data.endMonth ?? null,
        active: data.active ?? true,
      },
    });

    // Já gera as despesas dos meses cobertos até hoje, para o valor aparecer
    // no dashboard sem precisar navegar mês a mês.
    const created = await catchUpRecurringExpenses(prisma, userId, now.year, now.month);

    res.status(201).json({ ...serializeRecurringExpense(template), generatedNow: created });
  }),
);

recurringRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(recurringExpenseUpdateSchema, req.body);
    const userId = req.userId!;
    const existing = await prisma.recurringExpense.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) throw new HttpError(404, 'Despesa fixa não encontrada.');

    if (data.categoryId !== undefined) await assertOwnedCategory(userId, data.categoryId);
    if (data.accountId !== undefined) await assertOwnedAccount(userId, data.accountId);

    const updated = await prisma.recurringExpense.update({
      where: { id: existing.id },
      data: {
        description: data.description,
        amount: data.amount !== undefined ? reaisToCents(data.amount) : undefined,
        dayOfMonth: data.dayOfMonth,
        categoryId: data.categoryId,
        accountId: data.accountId,
        startYear: data.startYear,
        startMonth: data.startMonth,
        endYear: data.endYear,
        endMonth: data.endMonth,
        active: data.active,
      },
    });

    // Editar o template atualiza a despesa DO MÊS CORRENTE (ainda "em aberto");
    // meses passados ficam como estão, para não reescrever o histórico.
    const now = currentYearMonth();
    const { start, end } = monthRange(now.year, now.month);
    if (updated.active) {
      await prisma.expense.updateMany({
        where: { userId, recurringExpenseId: updated.id, date: { gte: start, lt: end } },
        data: { description: updated.description, amount: updated.amount },
      });
      await catchUpRecurringExpenses(prisma, userId, now.year, now.month);
    }

    res.json(serializeRecurringExpense(updated));
  }),
);

/**
 * Remove o template. Por padrão o histórico já lançado é PRESERVADO (as
 * despesas passadas continuam contando nos relatórios) e só perde o vínculo.
 * Com ?deleteGenerated=1, apaga também as despesas geradas por ele.
 */
recurringRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const existing = await prisma.recurringExpense.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) throw new HttpError(404, 'Despesa fixa não encontrada.');

    if (req.query.deleteGenerated === '1') {
      await prisma.expense.deleteMany({ where: { userId, recurringExpenseId: existing.id } });
    }
    // onDelete: SetNull no schema já desvincula as despesas mantidas.
    await prisma.recurringExpense.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

/**
 * Lança AGORA as despesas fixas de um mês, mesmo que ele ainda não tenha
 * chegado. É a ferramenta de "puxar os gastos recorrentes para o próximo mês":
 * o dia 1 de agosto já fica montado enquanto você ainda está em julho.
 *
 * Idempotente — rodar de novo não duplica nada, só completa o que faltar.
 * POST /api/recurring/materialize?year=&month=
 */
recurringRouter.post(
  '/materialize',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const now = currentYearMonth();
    const year = req.query.year !== undefined ? Number(req.query.year) : now.year;
    const month = req.query.month !== undefined ? Number(req.query.month) : now.month;
    if (!isValidYearMonth(year, month)) {
      throw new HttpError(400, 'Parâmetros year (1970-9999) e month (1-12) inválidos.');
    }

    // Pedido explícito de lançar as fixas vence a limpeza do mês: se o usuário
    // apagou os fixos e agora clica em "lançar", ele quer os fixos de volta.
    await prisma.monthlyRecurringClear.deleteMany({ where: { userId, year, month } });

    const created = await materializeRecurringExpenses(prisma, userId, year, month);

    const { start, end } = monthRange(year, month);
    const total = await prisma.expense.aggregate({
      where: { userId, recurringExpenseId: { not: null }, date: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    res.json({
      year,
      month,
      createdCount: created,
      // Total das fixas daquele mês, para a tela poder dizer quanto entrou.
      recurringTotal: centsToReais(total._sum.amount ?? 0),
    });
  }),
);

/**
 * Migração de quem já usava a flag `recurring` à mão: transforma as despesas
 * marcadas como recorrentes do mês informado em templates. Ignora as que já
 * vieram de um template e as que já têm um template com a mesma descrição.
 * POST /api/recurring/import?year=&month=
 */
recurringRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const now = currentYearMonth();
    const year = req.query.year !== undefined ? Number(req.query.year) : now.year;
    const month = req.query.month !== undefined ? Number(req.query.month) : now.month;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpError(400, 'Parâmetros year/month inválidos.');
    }

    const { start, end } = monthRange(year, month);
    const [candidates, templates] = await Promise.all([
      prisma.expense.findMany({
        where: { userId, recurring: true, recurringExpenseId: null, date: { gte: start, lt: end } },
      }),
      prisma.recurringExpense.findMany({ where: { userId }, select: { description: true } }),
    ]);

    const known = new Set(templates.map((t) => t.description.trim().toLowerCase()));
    const created: string[] = [];

    for (const e of candidates) {
      const key = e.description.trim().toLowerCase();
      if (known.has(key)) continue;
      known.add(key);

      const template = await prisma.recurringExpense.create({
        data: {
          userId,
          description: e.description,
          amount: e.amount,
          dayOfMonth: e.date.getUTCDate(),
          categoryId: e.categoryId,
          accountId: e.accountId,
          startYear: year,
          startMonth: month,
          active: true,
        },
      });
      // Vincula a despesa que originou o template, para o mês não duplicar.
      await prisma.expense.update({
        where: { id: e.id },
        data: { recurringExpenseId: template.id },
      });
      created.push(template.description);
    }

    const generated = await catchUpRecurringExpenses(prisma, userId, now.year, now.month);
    res.json({ importedCount: created.length, imported: created, generatedCount: generated });
  }),
);
