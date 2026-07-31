/**
 * Renda fixa (salário e VR) que se repete sozinha mês a mês.
 *
 * Salário e vale são o mesmo valor todo mês até você receber um aumento.
 * Obrigar a redigitar em janeiro, fevereiro, março... fazia todo mês novo
 * nascer com renda R$ 0 e "ainda posso gastar" negativo, até você lembrar de
 * preencher.
 *
 * Agora o valor de um mês sem registro é HERDADO do registro mais recente
 * anterior a ele. Nada é gravado: continua existindo só o que você digitou.
 * No dia em que o salário mudar, você edita naquele mês e o novo valor passa
 * a valer dali pra frente — os meses antigos ficam com o valor antigo.
 */

import type { PrismaClient } from '@prisma/client';
import { monthIndex } from './recurring';

/** Tabelas com o mesmo formato (userId, year, month, amount). */
export type FixedIncomeKind = 'salary' | 'voucher';

export interface FixedIncomeValue {
  /** Centavos. 0 quando nunca foi definido. */
  amount: number;
  /** true quando o valor veio de um mês anterior, não deste mês. */
  inherited: boolean;
  /** Mês de origem do valor herdado (null quando é deste mês ou não existe). */
  inheritedFrom: { year: number; month: number } | null;
}

const EMPTY: FixedIncomeValue = { amount: 0, inherited: false, inheritedFrom: null };

/**
 * Valor vigente de salário/VR num mês: o registro do próprio mês, ou — se não
 * houver — o do mês definido mais recente ANTES dele.
 */
export async function effectiveFixedIncome(
  prisma: PrismaClient,
  userId: string,
  kind: FixedIncomeKind,
  year: number,
  month: number,
): Promise<FixedIncomeValue> {
  const where = { userId_year_month: { userId, year, month } };
  // Registro mais recente estritamente anterior: qualquer mês de um ano
  // anterior, ou um mês menor dentro do mesmo ano.
  const previousQuery = {
    where: { userId, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
    orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }],
  };

  // O if/else é necessário: os dois delegates do Prisma têm tipos distintos e
  // uma variável com a união deles não fica chamável.
  const own =
    kind === 'salary'
      ? await prisma.monthlySalary.findUnique({ where })
      : await prisma.monthlyVoucher.findUnique({ where });
  if (own) return { amount: own.amount, inherited: false, inheritedFrom: null };

  const previous =
    kind === 'salary'
      ? await prisma.monthlySalary.findFirst(previousQuery)
      : await prisma.monthlyVoucher.findFirst(previousQuery);
  if (!previous) return EMPTY;

  return {
    amount: previous.amount,
    inherited: true,
    inheritedFrom: { year: previous.year, month: previous.month },
  };
}

/** Salário e VR vigentes de um mês, numa consulta só de cada. */
export async function effectiveIncomeForMonth(
  prisma: PrismaClient,
  userId: string,
  year: number,
  month: number,
): Promise<{ salary: FixedIncomeValue; voucher: FixedIncomeValue }> {
  const [salary, voucher] = await Promise.all([
    effectiveFixedIncome(prisma, userId, 'salary', year, month),
    effectiveFixedIncome(prisma, userId, 'voucher', year, month),
  ]);
  return { salary, voucher };
}

/**
 * Herança só vale daqui pra frente, nunca para trás: um mês anterior ao
 * primeiro registro continua zerado (não existia salário ainda).
 */
export function isBefore(
  year: number,
  month: number,
  ref: { year: number; month: number },
): boolean {
  return monthIndex(year, month) < monthIndex(ref.year, ref.month);
}
