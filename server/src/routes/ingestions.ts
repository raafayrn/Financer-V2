import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { centsToReais, reaisToCents } from '../lib/money';
import { ingestionConfirmSchema } from '../validation/schemas';

export const ingestionsRouter = Router();

ingestionsRouter.use(requireAuth);

/**
 * Pendentes da ingestão automática.
 *
 * Aqui nada é calculado: a fila só existe para você olhar e decidir.
 * Confirmar copia os dados para uma Expense (ou Income, se for Pix recebido)
 * pelo mesmo caminho do lançamento manual — é nesse instante que o dinheiro
 * passa a contar no mês.
 */

/** Em que conta o lançamento cai, pelo tipo que o parser identificou. */
function accountKindForType(transactionType: string): 'CREDIT_CARD' | 'WALLET' | null {
  switch (transactionType) {
    case 'credit_purchase':
      return 'CREDIT_CARD';
    case 'pix_out':
    case 'pix_in':
      return 'WALLET';
    // transfer/payment/unknown não têm conta óbvia: a tela pergunta.
    default:
      return null;
  }
}

function serializeIngestion(row: {
  id: string;
  amount: number | null;
  merchant: string;
  categoryId: string | null;
  suggestedCategory: string | null;
  occurredAt: Date | null;
  receivedAt: Date;
  source: string;
  status: string;
  transactionType: string;
  parseConfidence: string;
  mergedFrom: string;
  expenseId: string | null;
  incomeId: string | null;
}) {
  return {
    id: row.id,
    amount: row.amount === null ? null : centsToReais(row.amount),
    merchant: row.merchant,
    categoryId: row.categoryId,
    suggestedCategory: row.suggestedCategory,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
    source: row.source,
    status: row.status,
    transactionType: row.transactionType,
    parseConfidence: row.parseConfidence,
    // Presente = este registro absorveu outro (atalho + e-mail da mesma
    // compra). A tela marca como o mais confiável da fila.
    mergedFrom: JSON.parse(row.mergedFrom || '[]') as string[],
    expenseId: row.expenseId,
    incomeId: row.incomeId,
  };
}

/** Lista a fila. Sem filtro = só os pendentes, que é o caso de uso real. */
ingestionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const rows = await prisma.expenseIngestion.findMany({
      where: { userId: req.userId!, ...(status === 'all' ? {} : { status }) },
      orderBy: [{ occurredAt: 'desc' }, { receivedAt: 'desc' }],
      take: 200,
    });
    res.json({ ingestions: rows.map(serializeIngestion) });
  }),
);

/** Quantos esperam você — alimenta o contador no menu. */
ingestionsRouter.get(
  '/count',
  asyncHandler(async (req, res) => {
    const pending = await prisma.expenseIngestion.count({
      where: { userId: req.userId!, status: 'pending' },
    });
    res.json({ pending });
  }),
);

async function findOwnedPending(userId: string, id: string) {
  const row = await prisma.expenseIngestion.findFirst({ where: { id, userId } });
  if (!row) throw new HttpError(404, 'Pendente não encontrado.');
  if (row.status !== 'pending') {
    throw new HttpError(409, 'Este pendente já foi resolvido.');
  }
  return row;
}

/**
 * Confirma um pendente, virando lançamento de verdade.
 *
 * O corpo pode trazer correções (valor, descrição, categoria, conta, data):
 * a tela abre o formulário preenchido e o que você ajustar ali é o que vale.
 * O registro da ingestão continua existindo como histórico de como o dado
 * chegou, apontando para o lançamento que gerou.
 */
ingestionsRouter.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const row = await findOwnedPending(userId, req.params.id);
    const overrides = parseBody(ingestionConfirmSchema, req.body ?? {});

    const amountCents =
      overrides.amount !== undefined ? reaisToCents(overrides.amount) : row.amount;
    if (amountCents === null) {
      throw new HttpError(400, 'Informe o valor antes de confirmar.');
    }

    const description = overrides.description?.trim() || row.merchant;
    if (!description) throw new HttpError(400, 'Informe a descrição antes de confirmar.');

    const categoryId =
      overrides.categoryId !== undefined ? overrides.categoryId : row.categoryId;
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
      if (!category) throw new HttpError(400, 'Categoria inválida.');
    }

    // A data do lançamento sai da hora da COMPRA, não da hora em que o aviso
    // chegou: um e-mail que chega depois da meia-noite não pode empurrar o
    // gasto para o dia seguinte.
    const baseDate = overrides.date
      ? new Date(`${overrides.date}T12:00:00.000Z`)
      : row.occurredAt ?? row.receivedAt;
    const date = new Date(
      `${baseDate.toISOString().slice(0, 10)}T12:00:00.000Z`,
    );

    let accountId = overrides.accountId ?? null;
    if (accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!account) throw new HttpError(400, 'Conta inválida.');
    } else {
      const kind = accountKindForType(row.transactionType);
      if (kind) {
        const account = await prisma.account.findFirst({ where: { userId, kind } });
        accountId = account?.id ?? null;
      }
    }

    // Pix recebido é entrada, não despesa — vira Income.
    const isIncome = row.transactionType === 'pix_in';

    const result = await prisma.$transaction(async (tx) => {
      if (isIncome) {
        const income = await tx.income.create({
          data: { userId, description, amount: amountCents, date, accountId },
        });
        const ingestion = await tx.expenseIngestion.update({
          where: { id: row.id },
          data: { status: 'confirmed', incomeId: income.id },
        });
        return { ingestion, expenseId: null, incomeId: income.id };
      }

      const expense = await tx.expense.create({
        data: { userId, description, amount: amountCents, date, categoryId, accountId },
      });
      const ingestion = await tx.expenseIngestion.update({
        where: { id: row.id },
        data: { status: 'confirmed', expenseId: expense.id },
      });
      return { ingestion, expenseId: expense.id, incomeId: null };
    });

    res.json({
      ingestion: serializeIngestion(result.ingestion),
      expenseId: result.expenseId,
      incomeId: result.incomeId,
    });
  }),
);

/** Descarta sem virar lançamento. A linha fica como histórico. */
ingestionsRouter.post(
  '/:id/discard',
  asyncHandler(async (req, res) => {
    const row = await findOwnedPending(req.userId!, req.params.id);
    const updated = await prisma.expenseIngestion.update({
      where: { id: row.id },
      data: { status: 'discarded' },
    });
    res.json({ ingestion: serializeIngestion(updated) });
  }),
);

/**
 * Desfaz uma fusão: o registro volta a ser o que era e os que ele absorveu
 * voltam para a fila. Existe porque a regra de dedup funde duas compras
 * iguais no mesmo lugar em 15 minutos (dois cafés seguidos) sem ter como
 * saber que eram duas.
 */
ingestionsRouter.post(
  '/:id/unmerge',
  asyncHandler(async (req, res) => {
    const row = await findOwnedPending(req.userId!, req.params.id);
    const mergedFrom = JSON.parse(row.mergedFrom || '[]') as string[];
    if (mergedFrom.length === 0) throw new HttpError(400, 'Este pendente não absorveu nenhum outro.');

    const [updated] = await prisma.$transaction([
      prisma.expenseIngestion.update({
        where: { id: row.id },
        data: { mergedFrom: '[]' },
      }),
      prisma.expenseIngestion.updateMany({
        where: { id: { in: mergedFrom }, userId: req.userId! },
        data: { status: 'pending' },
      }),
    ]);

    res.json({ ingestion: serializeIngestion(updated), restored: mergedFrom.length });
  }),
);
