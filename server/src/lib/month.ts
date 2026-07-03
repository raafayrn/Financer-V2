/**
 * Utilidades para trabalhar com o par (ano, mês). Um "mês" é sempre
 * identificado por year (ex.: 2026) e month (1-12).
 */

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

/** Valida se (year, month) formam um mês plausível. */
export function isValidYearMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 1970 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12
  );
}

/**
 * Intervalo [início, fim) que cobre todo o mês, em UTC. Usado para consultar
 * despesas de um mês específico no banco.
 */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

/** Mês corrente (no fuso do servidor) como YearMonth. */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
