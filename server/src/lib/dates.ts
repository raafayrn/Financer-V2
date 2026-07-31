/**
 * Helpers de data para a API. Assim como nos lançamentos financeiros, as datas
 * "AAAA-MM-DD" são fixadas às 12:00 UTC para evitar drift de fuso horário ao
 * serializar de volta.
 *
 * IMPORTANTE: "hoje" é sempre calculado no fuso do APP (APP_TZ, padrão
 * America/Sao_Paulo), NÃO no fuso do processo. O container Docker roda em UTC,
 * e usar UTC fazia o servidor virar o dia às 21h no horário de Brasília: a
 * água registrada à noite caía no dia seguinte, o treino de hoje virava o de
 * amanhã e a prova do dia sumia da lista.
 */

/** Fuso usado para decidir qual é "o dia de hoje" para o usuário. */
export const APP_TIME_ZONE = process.env.APP_TZ || 'America/Sao_Paulo';

// 'en-CA' formata como AAAA-MM-DD, que é exatamente o formato da API.
const isoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Converte "AAAA-MM-DD" para um Date fixo às 12:00 UTC. */
export function parseApiDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/** Converte um Date para "AAAA-MM-DD". */
export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Data de hoje como "AAAA-MM-DD" no fuso do app (APP_TZ). É a única fonte de
 * verdade de "hoje" no backend — rotas e jobs devem sempre passar por aqui.
 */
export function todayIso(now: Date = new Date()): string {
  return isoDateFmt.format(now);
}
