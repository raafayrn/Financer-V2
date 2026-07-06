import { describe, it, expect } from 'vitest';
import {
  computeSummary,
  statusFor,
  computeAccountBreakdown,
  computeIncomeSummary,
  type AccountKind,
} from '../src/lib/budget';
import { centsToReais, reaisToCents } from '../src/lib/money';
import { isValidYearMonth, monthRange } from '../src/lib/month';

describe('money', () => {
  it('converte reais para centavos sem erro de ponto flutuante', () => {
    expect(reaisToCents(150.5)).toBe(15050);
    expect(reaisToCents(0.1)).toBe(10);
    expect(reaisToCents(19.99)).toBe(1999);
  });

  it('converte centavos de volta para reais', () => {
    expect(centsToReais(15050)).toBe(150.5);
    expect(centsToReais(1999)).toBe(19.99);
  });

  it('soma valores decimais problemáticos corretamente via centavos', () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos é exato.
    const total = reaisToCents(0.1) + reaisToCents(0.2);
    expect(centsToReais(total)).toBe(0.3);
  });
});

describe('statusFor', () => {
  it('é ok sem orçamento definido', () => {
    expect(statusFor(0, false)).toBe('ok');
  });
  it('é ok abaixo de 80%', () => {
    expect(statusFor(0.5, true)).toBe('ok');
    expect(statusFor(0.79, true)).toBe('ok');
  });
  it('é warning entre 80% e 100%', () => {
    expect(statusFor(0.8, true)).toBe('warning');
    expect(statusFor(0.99, true)).toBe('warning');
  });
  it('é over em 100% ou mais', () => {
    expect(statusFor(1.0, true)).toBe('over');
    expect(statusFor(1.5, true)).toBe('over');
  });
});

describe('computeSummary', () => {
  const categories = [
    { id: 'c1', name: 'Alimentação', color: '#ef4444' },
    { id: 'c2', name: 'Transporte', color: '#3b82f6' },
  ];

  it('calcula total, restante e percentual (valores em centavos)', () => {
    const summary = computeSummary(
      100000, // R$ 1000,00
      [
        { amount: 30000, categoryId: 'c1' },
        { amount: 20000, categoryId: 'c2' },
        { amount: 10000, categoryId: null },
      ],
      categories,
    );

    expect(summary.budget).toBe(100000);
    expect(summary.totalSpent).toBe(60000);
    expect(summary.remaining).toBe(40000);
    expect(summary.percentUsed).toBeCloseTo(0.6);
    expect(summary.status).toBe('ok');
  });

  it('permite restante negativo quando passa do orçamento', () => {
    const summary = computeSummary(
      50000,
      [{ amount: 65000, categoryId: 'c1' }],
      categories,
    );
    expect(summary.remaining).toBe(-15000);
    expect(summary.percentUsed).toBeCloseTo(1.3);
    expect(summary.status).toBe('over');
  });

  it('trata orçamento não definido (0) sem dividir por zero', () => {
    const summary = computeSummary(0, [{ amount: 5000, categoryId: null }]);
    expect(summary.percentUsed).toBe(0);
    expect(summary.remaining).toBe(-5000);
    expect(summary.status).toBe('ok');
  });

  it('agrupa gastos por categoria em ordem decrescente', () => {
    const summary = computeSummary(
      100000,
      [
        { amount: 10000, categoryId: 'c1' },
        { amount: 25000, categoryId: 'c2' },
        { amount: 5000, categoryId: 'c1' },
        { amount: 8000, categoryId: null },
      ],
      categories,
    );

    expect(summary.byCategory).toHaveLength(3);
    // c2 (25000) > c1 (15000) > sem categoria (8000)
    expect(summary.byCategory[0]).toMatchObject({ categoryId: 'c2', spent: 25000 });
    expect(summary.byCategory[1]).toMatchObject({ categoryId: 'c1', spent: 15000 });
    expect(summary.byCategory[2]).toMatchObject({
      categoryId: null,
      categoryName: 'Sem categoria',
      spent: 8000,
    });
  });

  it('lida com mês sem despesas', () => {
    const summary = computeSummary(100000, [], categories);
    expect(summary.totalSpent).toBe(0);
    expect(summary.remaining).toBe(100000);
    expect(summary.byCategory).toHaveLength(0);
  });
});

describe('month', () => {
  it('valida ano/mês', () => {
    expect(isValidYearMonth(2026, 7)).toBe(true);
    expect(isValidYearMonth(2026, 13)).toBe(false);
    expect(isValidYearMonth(2026, 0)).toBe(false);
    expect(isValidYearMonth(1969, 7)).toBe(false);
  });

  it('gera intervalo [início, fim) do mês em UTC', () => {
    const { start, end } = monthRange(2026, 2);
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('vira o ano em dezembro', () => {
    const { start, end } = monthRange(2026, 12);
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('computeAccountBreakdown', () => {
  const kindById = new Map<string, AccountKind>([
    ['acc-card', 'CREDIT_CARD'],
    ['acc-vr', 'FOOD_VOUCHER'],
    ['acc-wallet', 'WALLET'],
  ]);

  it('separa fixo, variável, vale-alimentação e carteira', () => {
    const result = computeAccountBreakdown(
      [
        { amount: 10000, accountId: 'acc-card', recurring: true }, // fixo
        { amount: 5000, accountId: 'acc-card', recurring: false }, // variável
        { amount: 3000, accountId: 'acc-vr', recurring: false }, // vale
        { amount: 2000, accountId: 'acc-wallet', recurring: false }, // carteira
      ],
      kindById,
    );

    expect(result).toEqual({
      fixed: 10000,
      variable: 5000,
      foodVoucher: 3000,
      wallet: 2000,
      total: 20000,
    });
  });

  it('trata despesas sem conta (legado) como cartão, por recorrência', () => {
    const result = computeAccountBreakdown(
      [
        { amount: 1000, accountId: null, recurring: true },
        { amount: 2000, accountId: null, recurring: false },
      ],
      kindById,
    );
    expect(result.fixed).toBe(1000);
    expect(result.variable).toBe(2000);
    expect(result.foodVoucher).toBe(0);
    expect(result.wallet).toBe(0);
  });

  it('lida com lista vazia', () => {
    const result = computeAccountBreakdown([], kindById);
    expect(result).toEqual({ fixed: 0, variable: 0, foodVoucher: 0, wallet: 0, total: 0 });
  });
});

describe('computeIncomeSummary', () => {
  it('soma salário fixo, VR fixo e lançamentos avulsos', () => {
    const result = computeIncomeSummary(420000, 60000, [{ amount: 50000 }, { amount: 15000 }]);
    expect(result).toEqual({ salary: 420000, voucher: 60000, extra: 65000, total: 545000 });
  });

  it('funciona sem lançamentos avulsos', () => {
    const result = computeIncomeSummary(420000, 60000, []);
    expect(result).toEqual({ salary: 420000, voucher: 60000, extra: 0, total: 480000 });
  });

  it('funciona sem salário nem VR definidos', () => {
    const result = computeIncomeSummary(0, 0, [{ amount: 10000 }]);
    expect(result).toEqual({ salary: 0, voucher: 0, extra: 10000, total: 10000 });
  });
});
