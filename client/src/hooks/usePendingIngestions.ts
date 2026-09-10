import { usePendingIngestionCount } from '../api/queries';

/**
 * Quantos lançamentos automáticos esperam confirmação.
 *
 * Sem esse número na aba, a fila fica invisível: o que chega pelo e-mail do
 * banco ou pelo atalho não avisa em lugar nenhum, e um gasto esquecido lá
 * dentro é um gasto que não existe para o mês.
 *
 * O contador é uma query como qualquer outra (`['ingestions', 'count']`): a
 * tela de pendentes invalida essa key ao mexer na fila, e o refetch ao voltar
 * para a aba do navegador cobre o que chegou sozinho enquanto o app estava em
 * segundo plano. Foi o que substituiu o evento `ingestions-changed` e os
 * listeners de `focus` que este hook mantinha na mão.
 */
export function usePendingIngestions(): number {
  // O contador é enfeite: se a requisição falhar, a aba continua lá e
  // alcançável, só sem o número.
  return usePendingIngestionCount().data ?? 0;
}
