import { describe, it, expect, vi, afterEach } from 'vitest';
import { classesForIso, countdownLabel, daysUntil, readableOn, todayIsoStr } from './studies';

/**
 * Contagem de dias é o que decide se uma prova aparece como "Amanhã" ou como
 * "há 3 dias". Erra por um e o app mente sobre um prazo.
 */

describe('daysUntil', () => {
  afterEach(() => vi.useRealTimers());

  it('conta os dias até a data, ignorando a hora', () => {
    vi.useFakeTimers();
    // 23h de propósito: a hora não pode empurrar a contagem para o dia errado.
    vi.setSystemTime(new Date(2026, 8, 10, 23, 59));
    expect(daysUntil('2026-09-10')).toBe(0);
    expect(daysUntil('2026-09-11')).toBe(1);
    expect(daysUntil('2026-09-28')).toBe(18);
  });

  it('devolve negativo para data passada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 8, 0));
    expect(daysUntil('2026-09-07')).toBe(-3);
  });

  it('atravessa a virada do mês', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0));
    expect(daysUntil('2026-10-02')).toBe(2);
  });
});

describe('countdownLabel', () => {
  afterEach(() => vi.useRealTimers());

  it('escreve o prazo do jeito que se fala', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12, 0));
    expect(countdownLabel('2026-09-10')).toBe('Hoje');
    expect(countdownLabel('2026-09-11')).toBe('Amanhã');
    expect(countdownLabel('2026-09-15')).toBe('Faltam 5 dias');
  });

  it('faz a concordância no singular do atraso de um dia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12, 0));
    expect(countdownLabel('2026-09-09')).toBe('há 1 dia');
    expect(countdownLabel('2026-09-08')).toBe('há 2 dias');
  });
});

describe('todayIsoStr', () => {
  afterEach(() => vi.useRealTimers());

  it('usa o fuso local, não UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 22, 0));
    expect(todayIsoStr()).toBe('2026-09-10');
  });
});

describe('classesForIso', () => {
  it('devolve as aulas do dia da semana daquela data', () => {
    // 2026-09-10 é uma quinta-feira.
    const quinta = classesForIso('2026-09-10');
    expect(Array.isArray(quinta)).toBe(true);
  });

  it('devolve lista vazia (não undefined) em dia sem aula', () => {
    // 2026-09-13 é domingo.
    expect(classesForIso('2026-09-13')).toEqual([]);
  });
});

describe('readableOn', () => {
  // Não é preto puro: é o mesmo tom de tinta do texto do app.
  const ESCURO = '#17120e';

  it('põe texto escuro sobre fundo claro e claro sobre escuro', () => {
    expect(readableOn('#ffffff')).toBe(ESCURO);
    expect(readableOn('#0e6c78')).toBe('#ffffff');
  });

  it('entende hex de 3 dígitos', () => {
    expect(readableOn('#fff')).toBe(ESCURO);
  });

  it('escolhe pelo CONTRASTE, não pelo brilho ingênuo', () => {
    // Amarelo claro é onde texto branco fixo sumia — o caso que motivou a
    // função existir.
    expect(readableOn('#f5d76e')).toBe(ESCURO);
  });

  it('cai no branco quando não é hex, em vez de quebrar', () => {
    expect(readableOn('rebeccapurple')).toBe('#ffffff');
  });
});
