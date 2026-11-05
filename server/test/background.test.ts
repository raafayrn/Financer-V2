import { describe, it, expect } from 'vitest';
import { backgroundUpdateSchema } from '../src/validation/schemas';

describe('backgroundUpdateSchema', () => {
  it('aceita uma cena embutida sem imagem', () => {
    expect(backgroundUpdateSchema.safeParse({ preset: 'aurora' }).success).toBe(true);
  });

  it('exige a imagem no fundo personalizado', () => {
    expect(backgroundUpdateSchema.safeParse({ preset: 'custom' }).success).toBe(false);
    expect(
      backgroundUpdateSchema.safeParse({ preset: 'custom', image: 'data:image/jpeg;base64,AAAA' })
        .success,
    ).toBe(true);
  });

  it('recusa o que não é data URL de imagem', () => {
    const bad = ['https://exemplo.com/a.jpg', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA'];
    for (const image of bad) {
      expect(backgroundUpdateSchema.safeParse({ preset: 'custom', image }).success).toBe(false);
    }
  });

  it('recusa cena desconhecida e imagem grande demais', () => {
    expect(backgroundUpdateSchema.safeParse({ preset: 'praia' }).success).toBe(false);
    const big = `data:image/jpeg;base64,${'A'.repeat(200_000)}`;
    expect(backgroundUpdateSchema.safeParse({ preset: 'custom', image: big }).success).toBe(false);
  });
});
