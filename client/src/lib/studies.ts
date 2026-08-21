import type { AgendaEventCategory } from '../api/types';

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

export const SUBJECT_COLORS = [
  '#007aff', '#34c759', '#ff9500', '#af52de',
  '#ff2d55', '#5ac8fa', '#ffcc00', '#ff3b30',
];

/** Horário fixo semanal (1=Seg … 5=Sex). */
export const CLASS_SCHEDULE: Record<number, { time: string; name: string }[]> = {
  1: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  2: [
    { time: '18:55–20:35', name: 'Física Geral e Experimental II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  3: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Física Geral e Experimental II' },
  ],
  4: [
    { time: '18:55–20:35', name: 'Geometria e Álgebra Linear' },
    { time: '20:50–22:30', name: 'Introdução à Ciência dos Materiais' },
  ],
  5: [
    { time: '18:55–20:35', name: 'Desenho e Modelagem Geométrica' },
    { time: '20:50–22:30', name: 'Geometria e Álgebra Linear' },
  ],
};

export const CATEGORY_COLORS: Record<AgendaEventCategory, string> = {
  CONSULTA: '#ff6b35',
  EVENTO: '#af52de',
  COMPROMISSO: '#007aff',
  LEMBRETE: '#ffcc00',
  OUTRO: '#8e8e93',
};

export const CATEGORY_LABELS: Record<AgendaEventCategory, string> = {
  CONSULTA: 'Consulta',
  EVENTO: 'Evento',
  COMPROMISSO: 'Compromisso',
  LEMBRETE: 'Lembrete',
  OUTRO: 'Outro',
};

/** Dias entre hoje e a data ISO (negativo = passado). */
export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function countdownLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return `há ${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''}`;
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `Faltam ${d} dias`;
}

export function todayIsoStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** Aulas fixas do dia da semana daquela data ISO. */
export function classesForIso(iso: string) {
  const dow = new Date(iso + 'T00:00:00').getDay();
  return CLASS_SCHEDULE[dow] ?? [];
}

/**
 * Preto ou branco sobre `bg`, o que tiver mais contraste. As cores de matéria
 * variam de azul escuro a amarelo claro — texto branco fixo some no amarelo.
 */
export function readableOn(bg: string): string {
  let hex = bg.trim();
  // Resolve var(--token) antes de medir: sem isso o token cairia no padrão
  // branco, que some sobre o laranja claro do tema escuro.
  const varMatch = hex.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (varMatch) {
    hex = getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim();
  }
  if (!hex.startsWith('#')) return '#ffffff';
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const vsBlack = (L + 0.05) / 0.05;
  const vsWhite = 1.05 / (L + 0.05);
  return vsBlack >= vsWhite ? '#17120e' : '#ffffff';
}
