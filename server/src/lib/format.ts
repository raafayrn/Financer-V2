/** Formata um valor em reais como "R$ 1.234,56". */
export function formatCurrencyBRL(reais: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(reais);
}
