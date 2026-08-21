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
