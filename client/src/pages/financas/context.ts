import { useOutletContext } from 'react-router-dom';
import type { Account, Category, ChatPreview, Expense, Income, Summary } from '../../api/types';
import type { TrendPoint } from '../../api/queries';

export type { TrendPoint };

/** O que as abas de Finanças podem abrir. O container é quem renderiza. */
export type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; expense: Expense }
  | { kind: 'chat-batch'; previews: ChatPreview[]; index: number }
  | { kind: 'income'; defaultAccountId?: string }
  | { kind: 'edit-income'; income: Income }
  | { kind: 'income-sources' }
  | { kind: 'manage' }
  | { kind: 'clear-month' };

/**
 * Estado compartilhado pelas abas (Resumo / Lançamentos / Categorias). Fica no
 * container para que trocar de aba não refaça as requisições nem perca modal.
 */
export interface FinancasCtx {
  summary: Summary;
  expenses: Expense[];
  incomes: Income[];
  categories: Category[];
  accounts: Account[];
  trend: TrendPoint[];
  year: number;
  month: number;
  categoryById: Map<string, Category>;
  accountById: Map<string, Account>;
  walletAccountId?: string;
  openModal: (modal: ModalState) => void;
  /** Invalida as queries do mês (ver api/queries.ts). */
  reload: () => void;
  deleteExpense: (id: string) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
}

export function useFinancas(): FinancasCtx {
  return useOutletContext<FinancasCtx>();
}
