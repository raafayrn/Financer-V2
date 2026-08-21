import { useOutletContext } from 'react-router-dom';
import type { Account, Category, Expense, RecurringExpense } from '../../api/types';

export interface RecorrentesCtx {
  items: RecurringExpense[];
  /** Despesas do mês em exibição — de onde saem os parcelamentos ativos. */
  expenses: Expense[];
  categories: Category[];
  accounts: Account[];
  year: number;
  month: number;
  categoryById: Map<string, Category>;
  accountById: Map<string, Account>;
  reload: () => Promise<void>;
  /** Mensagem de resultado exibida no topo da aba (ex.: "3 despesas lançadas"). */
  notice: { kind: 'info' | 'error'; text: string } | null;
  setNotice: (n: { kind: 'info' | 'error'; text: string } | null) => void;
}

export function useRecorrentes(): RecorrentesCtx {
  return useOutletContext<RecorrentesCtx>();
}
