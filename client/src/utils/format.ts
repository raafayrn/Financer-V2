const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrency(value: number): string {
  return currencyFmt.format(value);
}

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTHS_PT_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function monthName(month: number): string {
  return MONTHS_PT[month - 1] ?? '';
}

export function monthShort(month: number): string {
  return MONTHS_PT_SHORT[month - 1] ?? '';
}

/** Formata "AAAA-MM-DD" como "DD/MM". */
export function formatDayMonth(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

/** Data de hoje como "AAAA-MM-DD" no fuso local. */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Valor curto para eixo de gráfico: "R$ 850", "R$ 1,2 mil". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${value < 0 ? '−' : ''}R$ ${k.toFixed(k >= 10 ? 0 : 1).replace('.', ',')} mil`;
  }
  return `${value < 0 ? '−' : ''}R$ ${Math.round(abs)}`;
}

/** Últimos `n` meses (mais antigo → mais novo) terminando em (year, month). */
export function lastMonths(year: number, month: number, n: number): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < n; i++) {
    result.unshift({ year: y, month: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return result;
}
