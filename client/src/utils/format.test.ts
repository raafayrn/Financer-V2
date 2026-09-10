import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatCurrency, formatDayMonth, monthName, monthShort, todayIso } from './format';

/**
 * Formatação é o que o usuário LÊ. Um erro aqui não quebra nada — só mostra o
 * número errado, que num app de dinheiro é pior do que quebrar.
 */

describe('formatCurrency', () => {
  it('usa o formato brasileiro, com símbolo e duas casas', () => {
    //   é o espaço não-quebrável que o Intl coloca depois do R$.
    expect(formatCurrency(1877)).toBe('R$ 1.877,00');
    expect(formatCurrency(0)).toBe('R$ 0,00');
    expect(formatCurrency(55.5)).toBe('R$ 55,50');
  });

  it('mostra o sinal do valor negativo — saldo estourado existe', () => {
    expect(formatCurrency(-1200)).toBe('-R$ 1.200,00');
  });

  it('arredonda para dois dígitos em vez de derramar centavos', () => {
    expect(formatCurrency(10.005)).toBe('R$ 10,01');
    expect(formatCurrency(10.004)).toBe('R$ 10,00');
  });
});

describe('monthName e monthShort', () => {
  it('traduzem 1..12', () => {
    expect(monthName(1)).toBe('Janeiro');
    expect(monthName(9)).toBe('Setembro');
    expect(monthName(12)).toBe('Dezembro');
    expect(monthShort(3)).toBe('Mar');
  });

  it('devolvem vazio fora da faixa, em vez de "undefined" na tela', () => {
    expect(monthName(0)).toBe('');
    expect(monthName(13)).toBe('');
    expect(monthShort(99)).toBe('');
  });
});

describe('formatDayMonth', () => {
  it('inverte a data ISO para o formato lido no Brasil', () => {
    expect(formatDayMonth('2026-09-10')).toBe('10/09');
    expect(formatDayMonth('2026-01-01')).toBe('01/01');
  });

  it('preserva o zero à esquerda', () => {
    expect(formatDayMonth('2026-03-05')).toBe('05/03');
  });
});

describe('todayIso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa o fuso LOCAL, não UTC', () => {
    vi.useFakeTimers();
    // 23h no horário de Brasília (UTC-3) já é o dia seguinte em UTC. O dia do
    // usuário é o do aparelho dele: precisa continuar sendo 10, não 11.
    vi.setSystemTime(new Date(2026, 8, 10, 23, 30));
    expect(todayIso()).toBe('2026-09-10');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0));
    expect(todayIso()).toBe('2026-01-05');
  });
});
