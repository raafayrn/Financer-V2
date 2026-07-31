import { describe, expect, it } from 'vitest';
import { APP_TIME_ZONE, parseApiDate, todayIso } from '../src/lib/dates';
import { currentYearMonth } from '../src/lib/month';

/**
 * Regressão do bug de fuso: o backend calculava "hoje" com
 * `new Date().toISOString()` (UTC). Como o container roda em UTC e o usuário
 * vive em UTC−3, das 21h à meia-noite o servidor já estava no dia seguinte:
 * a água registrada à noite caía no dia errado, o treino de hoje virava o de
 * amanhã e a prova do dia sumia da lista.
 */
describe('todayIso (fuso do app)', () => {
  it('usa America/Sao_Paulo por padrão', () => {
    expect(APP_TIME_ZONE).toBe('America/Sao_Paulo');
  });

  it('ainda é 31/07 às 20:30 em Brasília (23:30 UTC)', () => {
    expect(todayIso(new Date('2026-07-31T23:30:00Z'))).toBe('2026-07-31');
  });

  // O caso que quebrava: UTC já virou 01/08, mas em Brasília ainda é dia 31.
  it('ainda é 31/07 às 23:30 em Brasília (02:30 UTC do dia seguinte)', () => {
    expect(todayIso(new Date('2026-08-01T02:30:00Z'))).toBe('2026-07-31');
  });

  it('vira 01/08 só depois da meia-noite de Brasília (03:00 UTC)', () => {
    expect(todayIso(new Date('2026-08-01T03:30:00Z'))).toBe('2026-08-01');
  });

  it('funciona no início do dia em Brasília (10:00 UTC = 07:00 BRT)', () => {
    expect(todayIso(new Date('2026-07-31T10:00:00Z'))).toBe('2026-07-31');
  });
});

describe('currentYearMonth', () => {
  it('ainda é julho às 23:30 do dia 31 em Brasília', () => {
    expect(currentYearMonth(new Date('2026-08-01T02:30:00Z'))).toEqual({ year: 2026, month: 7 });
  });

  it('vira agosto depois da meia-noite de Brasília', () => {
    expect(currentYearMonth(new Date('2026-08-01T03:30:00Z'))).toEqual({ year: 2026, month: 8 });
  });

  it('vira o ano seguinte só depois da meia-noite de 31/12 em Brasília', () => {
    expect(currentYearMonth(new Date('2027-01-01T02:00:00Z'))).toEqual({ year: 2026, month: 12 });
    expect(currentYearMonth(new Date('2027-01-01T03:30:00Z'))).toEqual({ year: 2027, month: 1 });
  });
});

describe('weekday do treino de hoje', () => {
  // routes/workouts.ts faz parseApiDate(todayIso()).getUTCDay() para escolher
  // o dia do template semanal.
  function weekdayOf(now: Date): number {
    return parseApiDate(todayIso(now)).getUTCDay();
  }

  it('domingo 23:00 em Brasília ainda é domingo (0), não segunda', () => {
    // 2026-08-02 é um domingo. 23:00 BRT = 2026-08-03T02:00Z.
    expect(weekdayOf(new Date('2026-08-03T02:00:00Z'))).toBe(0);
  });

  it('vira segunda (1) depois da meia-noite de Brasília', () => {
    expect(weekdayOf(new Date('2026-08-03T03:30:00Z'))).toBe(1);
  });
});
