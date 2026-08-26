import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Quantos lançamentos automáticos esperam confirmação.
 *
 * Sem esse número na aba, a fila fica invisível: o que chega pelo e-mail do
 * banco ou pelo atalho não avisa em lugar nenhum, e um gasto esquecido lá
 * dentro é um gasto que não existe para o mês.
 *
 * A tela de pendentes dispara `ingestions-changed` ao mexer na fila; é o que
 * mantém o contador certo sem ficar perguntando ao servidor de tempos em
 * tempos.
 */
export function usePendingIngestions(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { pending } = await api.countPendingIngestions();
      setCount(pending);
    } catch {
      // O contador é enfeite: se falhar, a aba continua lá e alcançável.
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('ingestions-changed', onChange);
    // Voltar para a aba do navegador é quando um gasto novo pode ter chegado.
    window.addEventListener('focus', onChange);
    return () => {
      window.removeEventListener('ingestions-changed', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [refresh]);

  return count;
}
