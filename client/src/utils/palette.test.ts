import { describe, it, expect } from 'vitest';
import {
  AGENDA_CATEGORY_COLORS,
  AGENDA_CATEGORY_LABELS,
  DATA_COLORS,
  NEUTRAL_COLOR,
  dataColor,
} from './palette';

/**
 * A cor de uma matéria é escolhida POR ÍNDICE e depois persistida no banco.
 * Se `dataColor` mudar de resposta para o mesmo índice, matérias antigas
 * trocam de cor sozinhas — e cor é como o usuário reconhece cada uma.
 */

describe('dataColor', () => {
  it('é estável: mesmo índice, mesma cor', () => {
    expect(dataColor(0)).toBe(dataColor(0));
    expect(dataColor(3)).toBe(DATA_COLORS[3]);
  });

  it('dá a volta na lista para índices maiores que a paleta', () => {
    expect(dataColor(DATA_COLORS.length)).toBe(DATA_COLORS[0]);
    expect(dataColor(DATA_COLORS.length + 2)).toBe(DATA_COLORS[2]);
  });

  it('trata índice negativo sem devolver undefined', () => {
    // O módulo de número negativo em JS é negativo — daí a normalização dupla
    // na implementação. Sem ela, isto seria `undefined` e a cor sumiria.
    expect(dataColor(-1)).toBe(DATA_COLORS[DATA_COLORS.length - 1]);
    expect(dataColor(-DATA_COLORS.length)).toBe(DATA_COLORS[0]);
  });

  it('devolve sempre um hex de 6 dígitos', () => {
    for (let i = 0; i < 20; i++) {
      expect(dataColor(i)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('paleta de dados', () => {
  it('não tem cor repetida — duas matérias não podem parecer a mesma', () => {
    expect(new Set(DATA_COLORS).size).toBe(DATA_COLORS.length);
  });

  it('tem uma cor neutra para item sem categoria', () => {
    expect(NEUTRAL_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('categorias de agenda', () => {
  it('tem cor e rótulo para toda categoria — nenhuma cai em undefined', () => {
    for (const chave of Object.keys(AGENDA_CATEGORY_LABELS)) {
      expect(AGENDA_CATEGORY_COLORS[chave as keyof typeof AGENDA_CATEGORY_COLORS]).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(AGENDA_CATEGORY_LABELS[chave as keyof typeof AGENDA_CATEGORY_LABELS]).toBeTruthy();
    }
  });
});
