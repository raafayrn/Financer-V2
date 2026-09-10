import { describe, it, expect } from 'vitest';
import { INVESTMENT_TYPE_COLOR, INVESTMENT_TYPE_LABEL } from './investments';

/**
 * Um tipo de investimento sem rótulo apareceria como "undefined" no gráfico e
 * na lista. É barato garantir que os dois mapas cobrem o enum inteiro.
 */

const TIPOS = [
  'RENDA_FIXA',
  'TESOURO_DIRETO',
  'ACOES',
  'FUNDOS',
  'CRIPTO',
  'POUPANCA',
  'OUTRO',
] as const;

describe('mapas de investimento', () => {
  it('tem rótulo em português para todo tipo', () => {
    for (const t of TIPOS) {
      expect(INVESTMENT_TYPE_LABEL[t]).toBeTruthy();
      expect(INVESTMENT_TYPE_LABEL[t]).not.toContain('_');
    }
  });

  it('tem cor hex para todo tipo', () => {
    for (const t of TIPOS) {
      expect(INVESTMENT_TYPE_COLOR[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('não repete cor entre tipos — a legenda do gráfico depende disso', () => {
    const cores = TIPOS.map((t) => INVESTMENT_TYPE_COLOR[t]);
    expect(new Set(cores).size).toBe(cores.length);
  });
});
