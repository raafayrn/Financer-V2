import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ChatPreview } from '../api/types';

/**
 * Cola entre o shell (Layout) e a tela ativa.
 *
 * O assistente e o botão "+" passaram a viver no Layout para ficarem
 * disponíveis em qualquer tela — antes o caminho mais rápido de lançar um
 * gasto só existia em /financas. Como eles estão fora da página, precisam de
 * um canal para (a) pedir que a tela ativa recarregue e (b) entregar os
 * lançamentos detectados pelo assistente para a tela de Finanças confirmar.
 */
interface ShellValue {
  /** Muda a cada pedido de recarga; as telas usam como dependência de efeito. */
  refreshKey: number;
  requestRefresh: () => void;
  /** Lançamentos que o assistente detectou e aguardam confirmação em Finanças. */
  pendingPreviews: ChatPreview[] | null;
  setPendingPreviews: (previews: ChatPreview[] | null) => void;
}

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingPreviews, setPendingPreviews] = useState<ChatPreview[] | null>(null);

  const requestRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ refreshKey, requestRefresh, pendingPreviews, setPendingPreviews }),
    [refreshKey, requestRefresh, pendingPreviews],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell precisa estar dentro de <ShellProvider>');
  return ctx;
}
