import { useEffect, useRef } from 'react';

/**
 * Aviso de "os lançamentos mudaram". O botão "+" do dock e o chat agora são
 * globais (moram na casca, não na página), então quem lança um gasto não
 * conhece a tela aberta. A tela que mostra dinheiro escuta este evento e
 * recarrega o que exibe.
 */
const EVENT = 'orbit:data-changed';

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function useDataChanged(callback: () => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}
