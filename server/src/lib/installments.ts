/**
 * Parcelamento — o padrão do cartão brasileiro. Uma compra de R$ 1.200 em 6x
 * vira 6 despesas de R$ 200, uma por mês, a partir do mês da compra.
 *
 * Funções PURAS (sem banco), como budget.ts e recurring.ts.
 */

import { daysInMonth } from './recurring';

/**
 * Divide um total em N parcelas inteiras de centavos, sem perder nem inventar
 * dinheiro: a soma das parcelas é EXATAMENTE o total.
 *
 * O resto da divisão vai para as PRIMEIRAS parcelas, que é como as maquininhas
 * e os bancos brasileiros fazem — R$ 100 em 3x sai 33,34 / 33,33 / 33,33.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Número de parcelas deve ser um inteiro >= 1.');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Data de cada parcela: mesmo dia da compra, avançando um mês por parcela.
 * Compra dia 31/01 parcelada em 3x cai em 31/01, 28/02 e 31/03 — o dia é
 * encurtado nos meses que não têm aquele dia, nunca vaza para o mês seguinte.
 */
export function installmentDateIso(firstDateIso: string, index: number): string {
  const [year, month, day] = firstDateIso.split('-').map(Number);

  const totalMonths = month - 1 + index;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export interface InstallmentPlanItem {
  /** 1-based: "1/6". */
  installmentNo: number;
  installmentTotal: number;
  /** Centavos. */
  amount: number;
  date: string;
  /** Descrição já com o sufixo "(1/6)". */
  description: string;
}

/**
 * Monta o plano completo de parcelas de uma compra. `totalCents` é o valor
 * CHEIO da compra — não o da parcela.
 */
export function buildInstallmentPlan(
  description: string,
  totalCents: number,
  firstDateIso: string,
  count: number,
): InstallmentPlanItem[] {
  const amounts = splitInstallments(totalCents, count);
  return amounts.map((amount, i) => ({
    installmentNo: i + 1,
    installmentTotal: count,
    amount,
    date: installmentDateIso(firstDateIso, i),
    description: `${description} (${i + 1}/${count})`,
  }));
}
