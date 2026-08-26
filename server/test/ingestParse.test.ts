import { describe, it, expect } from 'vitest';
import { parseShortcutLocally } from '../src/lib/ingestParse';

/**
 * A leitura local é o que segura o canal do atalho quando não há chave da
 * Anthropic ou a API está fora — e é o caminho testável sem rede.
 */
describe('parseShortcutLocally', () => {
  it('separa valor e estabelecimento no formato mais comum', () => {
    const r = parseShortcutLocally('150 material de construção');
    expect(r.valor).toBe(150);
    expect(r.estabelecimento).toBe('material de construção');
    expect(r.transactionType).toBe('credit_purchase');
  });

  it('entende R$ e centavos com vírgula', () => {
    expect(parseShortcutLocally('R$ 32,90 farmácia').valor).toBe(32.9);
  });

  it('trata ponto como decimal quando há 2 casas', () => {
    expect(parseShortcutLocally('12.50 café').valor).toBe(12.5);
  });

  it('trata ponto como milhar quando há 3 casas', () => {
    expect(parseShortcutLocally('1.500 notebook').valor).toBe(1500);
  });

  it('remove a preposição que sobra na frente do estabelecimento', () => {
    expect(parseShortcutLocally('50 no mercado').estabelecimento).toBe('mercado');
    expect(parseShortcutLocally('20 reais na padaria').estabelecimento).toBe('padaria');
  });

  it('sem número, marca confiança baixa e não descarta o texto', () => {
    const r = parseShortcutLocally('almoço com o pessoal');
    expect(r.valor).toBeNull();
    expect(r.confianca).toBe('low');
    // O que o usuário digitou continua ali para ele resolver na tela.
    expect(r.estabelecimento).toBe('almoço com o pessoal');
  });

  it('nunca devolve confiança alta — sem IA não houve leitura de categoria', () => {
    expect(parseShortcutLocally('150 padaria').confianca).toBe('medium');
  });
});
