/**
 * Conversões entre reais (número decimal, usado na API) e centavos (inteiro,
 * usado internamente e no banco). Trabalhar em centavos evita erros de ponto
 * flutuante ao somar valores.
 */

/** Converte reais (ex.: 150.5) para centavos inteiros (ex.: 15050). */
export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

/** Converte centavos inteiros (ex.: 15050) para reais (ex.: 150.5). */
export function centsToReais(cents: number): number {
  return cents / 100;
}
