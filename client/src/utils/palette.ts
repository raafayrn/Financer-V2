import type { AgendaEventCategory, InvestmentType } from '../api/types';

/**
 * Paleta categórica única do app — matérias, categorias de agenda e tipos de
 * investimento. Antes cada tela declarava a própria lista de hex, então o
 * mesmo azul significava "primário", "hoje", "compromisso" e "renda fixa".
 *
 * Os valores são hex literais (e não `var(--data-N)`) porque a cor escolhida
 * para uma matéria é persistida no banco; um token CSS não sobrevive à
 * serialização. Os hex aqui espelham `--data-1..8` do tema claro, e o CSS
 * cuida de mantê-los legíveis nos dois temas via `color-mix`.
 */
export const DATA_COLORS = [
  '#0e6c78', // 1 · petróleo
  '#7d5296', // 2 · violeta
  '#b5541f', // 3 · terracota
  '#3d7a52', // 4 · sage
  '#a63e63', // 5 · magenta queimado
  '#2c5f92', // 6 · azul poeira
  '#8a7326', // 7 · oliva
  '#6b6157', // 8 · marrom-ardósia
];

/** Cor estável por índice, com wrap — para listas de tamanho arbitrário. */
export function dataColor(index: number): string {
  return DATA_COLORS[((index % DATA_COLORS.length) + DATA_COLORS.length) % DATA_COLORS.length];
}

/** Cor neutra para itens sem categoria atribuída. */
export const NEUTRAL_COLOR = '#6b6157';

export const AGENDA_CATEGORY_COLORS: Record<AgendaEventCategory, string> = {
  CONSULTA: DATA_COLORS[2],
  EVENTO: DATA_COLORS[1],
  COMPROMISSO: DATA_COLORS[0],
  LEMBRETE: DATA_COLORS[6],
  OUTRO: DATA_COLORS[7],
};

export const AGENDA_CATEGORY_LABELS: Record<AgendaEventCategory, string> = {
  CONSULTA: 'Consulta',
  EVENTO: 'Evento',
  COMPROMISSO: 'Compromisso',
  LEMBRETE: 'Lembrete',
  OUTRO: 'Outro',
};

export const INVESTMENT_TYPE_COLOR: Record<InvestmentType, string> = {
  RENDA_FIXA: DATA_COLORS[5],
  TESOURO_DIRETO: DATA_COLORS[3],
  ACOES: DATA_COLORS[4],
  FUNDOS: DATA_COLORS[1],
  CRIPTO: DATA_COLORS[2],
  POUPANCA: DATA_COLORS[0],
  OUTRO: DATA_COLORS[7],
};
