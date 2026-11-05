import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import type { Account, Category, ChatPreview, ExpenseInput } from '../api/types';
import { emitDataChanged } from '../lib/dataEvents';
import { ChatPanel } from './ChatPanel';
import { ExpenseFormModal } from './ExpenseFormModal';

/**
 * Ações globais da casca: o botão "+" do dock (novo gasto) e o assistente,
 * que abre pelo campo de comando da barra do topo. Antes cada página tinha o
 * seu ChatBox e o seu modal de gasto; agora há um só, e quem precisa saber que
 * algo foi lançado escuta `emitDataChanged`.
 */

interface QuickActionsValue {
  chatOpen: boolean;
  /** Abre o assistente; com `text`, já envia a mensagem. */
  openChat: (text?: string) => void;
  closeChat: () => void;
  newExpense: () => void;
}

/** Lote de lançamentos extraídos de uma foto/PDF pelo assistente. */
interface BatchState {
  previews: ChatPreview[];
  index: number;
}

const QuickActionsContext = createContext<QuickActionsValue | null>(null);

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [pending, setPending] = useState<{ id: number; text: string } | null>(null);
  const pendingId = useRef(0);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [lists, setLists] = useState<{ categories: Category[]; accounts: Account[] } | null>(null);

  // Categorias e contas só são buscadas quando um formulário vai abrir, e
  // de novo a cada abertura (podem ter mudado em Ajustes/Finanças).
  const loadLists = useCallback(async () => {
    const [categories, accounts] = await Promise.all([
      api.listCategories().catch((): Category[] => []),
      api.listAccounts().catch((): Account[] => []),
    ]);
    setLists({ categories, accounts });
    return { categories, accounts };
  }, []);

  const openChat = useCallback((text?: string) => {
    if (text && text.trim()) {
      pendingId.current += 1;
      setPending({ id: pendingId.current, text: text.trim() });
    }
    setChatOpen(true);
  }, []);
  const closeChat = useCallback(() => {
    setChatOpen(false);
    setPending(null);
  }, []);

  const newExpense = useCallback(() => {
    void loadLists().then(() => setExpenseOpen(true));
  }, [loadLists]);

  async function handleCreateExpense(input: ExpenseInput) {
    await api.createExpense(input);
    setExpenseOpen(false);
    emitDataChanged();
  }

  function startBatch(previews: ChatPreview[]) {
    void loadLists().then(() => setBatch({ previews, index: 0 }));
  }
  function advanceBatch() {
    setBatch((prev) => {
      if (!prev) return null;
      const nextIndex = prev.index + 1;
      if (nextIndex >= prev.previews.length) {
        emitDataChanged();
        return null;
      }
      return { previews: prev.previews, index: nextIndex };
    });
  }
  async function handleBatchSubmit(input: ExpenseInput) {
    await api.createExpense(input);
    advanceBatch();
  }
  async function handleAcceptAllBatch() {
    if (!batch) return;
    const defaultAccountId = lists?.accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? null;
    for (const preview of batch.previews.slice(batch.index)) {
      await api.createExpense({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        categoryId: preview.categoryId,
        accountId: defaultAccountId,
        recurring: preview.recurring,
      });
    }
    setBatch(null);
    emitDataChanged();
  }

  const value = useMemo(
    () => ({ chatOpen, openChat, closeChat, newExpense }),
    [chatOpen, openChat, closeChat, newExpense],
  );

  return (
    <QuickActionsContext.Provider value={value}>
      {children}

      {chatOpen && (
        <ChatPanel
          pending={pending}
          onClose={closeChat}
          onSaved={emitDataChanged}
          onPreviews={startBatch}
        />
      )}

      {expenseOpen && lists && (
        <ExpenseFormModal
          title="Novo gasto"
          categories={lists.categories}
          accounts={lists.accounts}
          onCancel={() => setExpenseOpen(false)}
          onSubmit={handleCreateExpense}
        />
      )}

      {batch && lists && (
        <ExpenseFormModal
          key={batch.index}
          title="Confirmar lançamento"
          progress={`${batch.index + 1} de ${batch.previews.length}`}
          categories={lists.categories}
          accounts={lists.accounts}
          initial={batch.previews[batch.index]}
          onCancel={() => {
            setBatch(null);
            emitDataChanged();
          }}
          onSubmit={handleBatchSubmit}
          onSkip={advanceBatch}
          onAcceptAll={handleAcceptAllBatch}
        />
      )}
    </QuickActionsContext.Provider>
  );
}

export function useQuickActions(): QuickActionsValue {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error('useQuickActions deve ser usado dentro de QuickActionsProvider.');
  return ctx;
}
