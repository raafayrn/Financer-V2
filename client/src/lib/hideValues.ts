import { useCallback, useState } from 'react';

const KEY = 'hideFinValues';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Ocultar valores" (o olho do Início). A escolha fica no localStorage para
 * valer também no Resumo e nos gráficos dele, que leem a mesma chave.
 */
export function useHideValues() {
  const [hidden, setHidden] = useState(read);
  const toggle = useCallback(() => {
    setHidden((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* sem storage, vale só nesta tela */
      }
      return next;
    });
  }, []);
  const mask = useCallback((value: string) => (hidden ? '••••' : value), [hidden]);
  return { hidden, toggle, mask };
}
