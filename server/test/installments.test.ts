import { describe, expect, it } from 'vitest';
import {
  buildInstallmentPlan,
  installmentDateIso,
  splitInstallments,
} from '../src/lib/installments';

describe('splitInstallments', () => {
  it('divide exato quando não sobra centavo', () => {
    expect(splitInstallments(120000, 6)).toEqual([20000, 20000, 20000, 20000, 20000, 20000]);
  });

  // O caso clássico: R$ 100 em 3x. Nenhum centavo pode sumir nem aparecer.
  it('joga o resto nas primeiras parcelas', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('a soma das parcelas é sempre exatamente o total', () => {
    for (const total of [1, 7, 99, 10000, 123456, 999999]) {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 10, 12, 18, 24]) {
        const parcelas = splitInstallments(total, n);
        expect(parcelas).toHaveLength(n);
        expect(parcelas.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('parcela única devolve o total', () => {
    expect(splitInstallments(4567, 1)).toEqual([4567]);
  });

  it('rejeita número de parcelas inválido', () => {
    expect(() => splitInstallments(1000, 0)).toThrow();
    expect(() => splitInstallments(1000, 2.5)).toThrow();
  });
});

describe('installmentDateIso', () => {
  it('avança um mês por parcela', () => {
    expect(installmentDateIso('2026-07-15', 0)).toBe('2026-07-15');
    expect(installmentDateIso('2026-07-15', 1)).toBe('2026-08-15');
    expect(installmentDateIso('2026-07-15', 5)).toBe('2026-12-15');
  });

  it('atravessa a virada de ano', () => {
    expect(installmentDateIso('2026-11-10', 2)).toBe('2027-01-10');
    expect(installmentDateIso('2026-12-05', 12)).toBe('2027-12-05');
  });

  // Compra dia 31 não pode virar dia 1 do mês seguinte.
  it('encurta o dia em meses mais curtos', () => {
    expect(installmentDateIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(installmentDateIso('2026-01-31', 3)).toBe('2026-04-30');
    expect(installmentDateIso('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('respeita ano bissexto', () => {
    expect(installmentDateIso('2028-01-30', 1)).toBe('2028-02-29');
  });

  it('nunca muda o mês de destino por causa do dia', () => {
    for (let i = 0; i < 24; i++) {
      const iso = installmentDateIso('2026-01-31', i);
      const esperado = new Date(Date.UTC(2026, i, 1));
      expect(iso.slice(0, 7)).toBe(
        `${esperado.getUTCFullYear()}-${String(esperado.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
  });
});

describe('buildInstallmentPlan', () => {
  it('monta as parcelas com descrição numerada', () => {
    const plano = buildInstallmentPlan('Notebook', 300000, '2026-07-20', 3);
    expect(plano).toHaveLength(3);
    expect(plano[0]).toMatchObject({
      installmentNo: 1,
      installmentTotal: 3,
      amount: 100000,
      date: '2026-07-20',
      description: 'Notebook (1/3)',
    });
    expect(plano[2]).toMatchObject({ date: '2026-09-20', description: 'Notebook (3/3)' });
  });

  it('preserva o total da compra na soma das parcelas', () => {
    const plano = buildInstallmentPlan('Celular', 259999, '2026-07-20', 7);
    expect(plano.reduce((sum, p) => sum + p.amount, 0)).toBe(259999);
  });
});
