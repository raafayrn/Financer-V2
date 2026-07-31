import { describe, expect, it } from 'vitest';
import {
  appliesToMonth,
  daysInMonth,
  dueDateIso,
  monthIndex,
  monthsBetween,
  postingDateIso,
} from '../src/lib/recurring';

const base = { startYear: 2026, startMonth: 3, endYear: null, endMonth: null, active: true };

describe('appliesToMonth', () => {
  it('não vale antes do mês inicial', () => {
    expect(appliesToMonth(base, 2026, 2)).toBe(false);
  });

  it('vale a partir do mês inicial', () => {
    expect(appliesToMonth(base, 2026, 3)).toBe(true);
    expect(appliesToMonth(base, 2027, 1)).toBe(true);
  });

  it('não vale quando pausado', () => {
    expect(appliesToMonth({ ...base, active: false }, 2026, 6)).toBe(false);
  });

  it('respeita o mês final quando definido', () => {
    const t = { ...base, endYear: 2026, endMonth: 8 };
    expect(appliesToMonth(t, 2026, 8)).toBe(true);
    expect(appliesToMonth(t, 2026, 9)).toBe(false);
  });

  it('atravessa a virada de ano corretamente', () => {
    const t = { ...base, startYear: 2026, startMonth: 11, endYear: 2027, endMonth: 2 };
    expect(appliesToMonth(t, 2026, 10)).toBe(false);
    expect(appliesToMonth(t, 2026, 12)).toBe(true);
    expect(appliesToMonth(t, 2027, 2)).toBe(true);
    expect(appliesToMonth(t, 2027, 3)).toBe(false);
  });
});

// O gasto fixo está comprometido desde o dia 1 — é o que o app precisa
// mostrar logo que a fatura nova abre.
describe('postingDateIso (data do lançamento)', () => {
  it('é sempre o dia 1 do mês, independente do vencimento', () => {
    expect(postingDateIso(2026, 7)).toBe('2026-07-01');
    expect(postingDateIso(2026, 2)).toBe('2026-02-01');
    expect(postingDateIso(2026, 12)).toBe('2026-12-01');
  });

  it('nunca cai no mês anterior nem no seguinte', () => {
    for (let m = 1; m <= 12; m++) {
      expect(postingDateIso(2026, m)).toBe(`2026-${String(m).padStart(2, '0')}-01`);
    }
  });
});

describe('dueDateIso (vencimento, só exibição)', () => {
  it('usa o dia pedido quando o mês tem esse dia', () => {
    expect(dueDateIso(2026, 7, 10)).toBe('2026-07-10');
  });

  // O caso que quebra sozinho: template dia 31 num mês de 30 dias.
  it('encurta para o último dia em meses mais curtos', () => {
    expect(dueDateIso(2026, 4, 31)).toBe('2026-04-30');
    expect(dueDateIso(2026, 2, 31)).toBe('2026-02-28');
  });

  it('acerta fevereiro em ano bissexto', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(dueDateIso(2028, 2, 30)).toBe('2028-02-29');
  });

  it('nunca vaza para o mês seguinte', () => {
    for (let m = 1; m <= 12; m++) {
      expect(dueDateIso(2026, m, 31).slice(0, 7)).toBe(`2026-${String(m).padStart(2, '0')}`);
    }
  });
});

describe('monthsBetween', () => {
  it('inclui as duas pontas', () => {
    expect(monthsBetween(2026, 5, 2026, 7)).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it('atravessa a virada de ano', () => {
    expect(monthsBetween(2026, 12, 2027, 2)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it('devolve só o próprio mês quando início = fim', () => {
    expect(monthsBetween(2026, 7, 2026, 7)).toEqual([{ year: 2026, month: 7 }]);
  });

  it('devolve vazio quando o início é depois do fim', () => {
    expect(monthsBetween(2026, 8, 2026, 7)).toEqual([]);
  });
});

describe('monthIndex', () => {
  it('é monotônico através da virada de ano', () => {
    expect(monthIndex(2026, 12) + 1).toBe(monthIndex(2027, 1));
  });
});
