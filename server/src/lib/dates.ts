/**
 * Helpers de data para a API. Assim como nos lançamentos financeiros, as datas
 * "AAAA-MM-DD" são fixadas às 12:00 UTC para evitar drift de fuso horário ao
 * serializar de volta.
 */

/** Converte "AAAA-MM-DD" para um Date fixo às 12:00 UTC. */
export function parseApiDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/** Converte um Date para "AAAA-MM-DD". */
export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Data de hoje como "AAAA-MM-DD" (fuso UTC, consistente com parseApiDate). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
