import type { PrismaClient, ExpenseIngestion } from '@prisma/client';

/**
 * Deduplicação das ingestões automáticas.
 *
 * O problema: a mesma compra chega duas vezes — pelo atalho, no momento do
 * pagamento, e pelo e-mail do Nubank, horas depois. Sem isto, o gasto é
 * contado em dobro.
 *
 * O ponto que faz a coisa toda funcionar: a janela é medida sobre
 * `occurredAt` (a hora da COMPRA), nunca sobre `receivedAt` (a hora em que o
 * registro chegou aqui). Se fosse pela chegada, o e-mail atrasado nunca
 * casaria com o atalho — que é exatamente o caso que a dedup existe para
 * resolver.
 */

/** Tolerância de valor: no atalho você digita de memória e arredonda. */
export const AMOUNT_TOLERANCE_CENTS = 50;
/** Janela sobre a hora da compra. */
export const TIME_WINDOW_MINUTES = 15;

export interface DedupeCandidate {
  userId: string;
  amount: number | null;
  occurredAt: Date | null;
  transactionType: string;
  source: string;
  /**
   * O próprio registro, quando ele já foi gravado. A busca roda depois do
   * insert (o id precisa existir para `mergedFrom` poder apontar para ele),
   * então sem isto o registro casaria consigo mesmo.
   */
  excludeId?: string;
}

export type DedupeOutcome = 'created' | 'merged' | 'ignored';

/**
 * Procura uma ingestão pendente que seja a mesma transação.
 *
 * Só compras no crédito entram: um Pix recebido é entrada, não despesa, e
 * dois Pix de mesmo valor no mesmo minuto são coisas diferentes de verdade.
 * Sem valor ou sem hora não há como comparar — nesses casos o registro entra
 * como novo, e você resolve na tela.
 */
export async function findDuplicate(
  prisma: PrismaClient,
  candidate: DedupeCandidate,
): Promise<ExpenseIngestion | null> {
  if (candidate.transactionType !== 'credit_purchase') return null;
  if (candidate.amount === null || candidate.occurredAt === null) return null;

  const windowMs = TIME_WINDOW_MINUTES * 60 * 1000;

  return prisma.expenseIngestion.findFirst({
    where: {
      userId: candidate.userId,
      ...(candidate.excludeId ? { id: { not: candidate.excludeId } } : {}),
      transactionType: 'credit_purchase',
      // Só entre pendentes: se você já confirmou um lançamento, um e-mail
      // atrasado da mesma compra entra como novo pendente e você descarta na
      // mão. É preferível a fundir em silêncio num registro já revisado.
      status: 'pending',
      occurredAt: {
        gte: new Date(candidate.occurredAt.getTime() - windowMs),
        lte: new Date(candidate.occurredAt.getTime() + windowMs),
      },
      amount: {
        gte: candidate.amount - AMOUNT_TOLERANCE_CENTS,
        lte: candidate.amount + AMOUNT_TOLERANCE_CENTS,
      },
    },
    orderBy: { occurredAt: 'desc' },
  });
}

/**
 * Funde o registro novo no que já existia.
 *
 * O e-mail sempre vence: traz o valor exato e o nome real do estabelecimento,
 * enquanto o atalho traz o que você digitou às pressas. O registro do atalho
 * é preservado (e promovido), não substituído — assim o `id` que já pode ter
 * sido mostrado em algum lugar continua valendo.
 *
 * O perdedor não é apagado: fica como `discarded` apontado por `mergedFrom`,
 * que é o que permite desfazer a fusão sem adivinhação.
 */
export async function mergeIntoExisting(
  prisma: PrismaClient,
  existing: ExpenseIngestion,
  incoming: ExpenseIngestion,
): Promise<ExpenseIngestion> {
  const mergedFrom: string[] = JSON.parse(existing.mergedFrom || '[]');
  mergedFrom.push(incoming.id);

  const emailWins = incoming.source === 'email' && existing.source !== 'email';

  const [updated] = await prisma.$transaction([
    prisma.expenseIngestion.update({
      where: { id: existing.id },
      data: {
        // Só o e-mail promove dados. Uma duplicata do mesmo canal não tem
        // nada melhor a oferecer que o que já está gravado.
        ...(emailWins
          ? {
              amount: incoming.amount ?? existing.amount,
              merchant: incoming.merchant || existing.merchant,
              occurredAt: incoming.occurredAt ?? existing.occurredAt,
              categoryId: incoming.categoryId ?? existing.categoryId,
              suggestedCategory: incoming.suggestedCategory ?? existing.suggestedCategory,
              parseConfidence: incoming.parseConfidence,
              source: 'email+shortcut',
            }
          : {}),
        mergedFrom: JSON.stringify(mergedFrom),
      },
    }),
    prisma.expenseIngestion.update({
      where: { id: incoming.id },
      data: { status: 'discarded' },
    }),
  ]);

  return updated;
}
