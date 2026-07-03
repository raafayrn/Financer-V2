import { Request } from 'express';
import { currentYearMonth, isValidYearMonth } from './month';
import { HttpError } from './http';

/**
 * Lê year/month da query string. Se ausentes, usa o mês corrente. Lança 400
 * se presentes mas inválidos.
 */
export function readYearMonth(req: Request): { year: number; month: number } {
  const hasYear = req.query.year !== undefined;
  const hasMonth = req.query.month !== undefined;

  if (!hasYear && !hasMonth) {
    return currentYearMonth();
  }

  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!isValidYearMonth(year, month)) {
    throw new HttpError(400, 'Parâmetros year (1970-9999) e month (1-12) inválidos.');
  }
  return { year, month };
}
