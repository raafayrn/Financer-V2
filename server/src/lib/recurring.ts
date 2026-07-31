/**
 * Despesas fixas: um template (RecurringExpense) vira uma Expense por mês,
 * gerada automaticamente. Você cadastra "aluguel, R$ 1.200, dia 10" uma vez e
 * não redigita nunca mais.
 *
 * As funções de decisão aqui são PURAS (sem banco), como em budget.ts — quem
 * toca no Prisma é `materializeRecurringExpenses`, no fim do arquivo.
 */

import type { PrismaClient } from '@prisma/client';
import { monthRange } from './month';

export interface RecurringWindow {
  startYear: number;
  startMonth: number;
  endYear: number | null;
  endMonth: number | null;
  active: boolean;
}

/** Transforma (ano, mês) num inteiro comparável — ex.: 2026-07 -> 24319. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** O template vale para o mês informado? */
export function appliesToMonth(t: RecurringWindow, year: number, month: number): boolean {
  if (!t.active) return false;
  const target = monthIndex(year, month);
  if (target < monthIndex(t.startYear, t.startMonth)) return false;
  if (t.endYear !== null && t.endMonth !== null && target > monthIndex(t.endYear, t.endMonth)) {
    return false;
  }
  return true;
}

/** Quantos dias tem o mês (UTC, para casar com o resto do app). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Data de LANÇAMENTO das despesas fixas: sempre o dia 1 do mês.
 *
 * O ponto do app é saber quanto ainda dá pra gastar já no primeiro dia da
 * fatura nova. Datar no vencimento (dia 10, dia 20) fazia o gasto fixo
 * aparecer espalhado ao longo do mês, como se fosse surgindo aos poucos —
 * quando na prática ele está comprometido desde o dia 1.
 *
 * `dayOfMonth` do template continua existindo como a data de VENCIMENTO
 * (exibida na tela e usada para lembretes), só não define mais onde o
 * lançamento cai.
 */
export function postingDateIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Data de vencimento no mês, como "AAAA-MM-DD". Um template de dia 31 cai no
 * dia 28/29/30 nos meses que não têm dia 31 — nunca vaza para o mês seguinte.
 * Usada para exibição e lembretes, não para datar o lançamento.
 */
export function dueDateIso(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(Math.max(dayOfMonth, 1), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Lista dos meses de `from` até `to`, inclusive (vazia se from > to). */
export function monthsBetween(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = fromYear;
  let m = fromMonth;
  while (monthIndex(y, m) <= monthIndex(toYear, toMonth)) {
    result.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

/**
 * Gera as despesas que faltam para (year, month) a partir dos templates ativos
 * do usuário. É IDEMPOTENTE: só cria o que ainda não existe, então pode ser
 * chamada em toda leitura do mês sem duplicar nada.
 *
 * Devolve quantas despesas foram criadas.
 */
export async function materializeRecurringExpenses(
  prisma: PrismaClient,
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const templates = await prisma.recurringExpense.findMany({ where: { userId, active: true } });
  const applicable = templates.filter((t) => appliesToMonth(t, year, month));
  if (applicable.length === 0) return 0;

  // Quais templates já têm despesa neste mês? Uma consulta só, sem N+1.
  const { start, end } = monthRange(year, month);
  const existing = await prisma.expense.findMany({
    where: {
      userId,
      recurringExpenseId: { in: applicable.map((t) => t.id) },
      date: { gte: start, lt: end },
    },
    select: { recurringExpenseId: true },
  });
  const alreadyDone = new Set(existing.map((e) => e.recurringExpenseId));

  const missing = applicable.filter((t) => !alreadyDone.has(t.id));
  if (missing.length === 0) return 0;

  await prisma.expense.createMany({
    data: missing.map((t) => ({
      userId,
      description: t.description,
      amount: t.amount,
      // Sempre dia 1: a fatura do mês já nasce inteira (ver postingDateIso).
      date: new Date(`${postingDateIso(year, month)}T12:00:00.000Z`),
      categoryId: t.categoryId,
      accountId: t.accountId,
      recurring: true,
      recurringExpenseId: t.id,
    })),
  });

  return missing.length;
}

/**
 * Materializa do mês inicial do template mais antigo até (year, month) — usado
 * no boot e quando o app fica dias/meses sem abrir. Nunca gera para o futuro:
 * o teto é sempre o mês corrente informado por quem chama.
 */
export async function catchUpRecurringExpenses(
  prisma: PrismaClient,
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const templates = await prisma.recurringExpense.findMany({
    where: { userId, active: true },
    select: { startYear: true, startMonth: true },
    orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    take: 1,
  });
  const first = templates[0];
  if (!first) return 0;

  let created = 0;
  for (const m of monthsBetween(first.startYear, first.startMonth, year, month)) {
    created += await materializeRecurringExpenses(prisma, userId, m.year, m.month);
  }
  return created;
}
