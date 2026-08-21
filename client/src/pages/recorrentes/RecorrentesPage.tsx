import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Account, Category, Expense, RecurringExpense } from '../../api/types';
import { useMonth } from '../../context/MonthContext';
import type { RecorrentesCtx } from './context';

/**
 * Container das abas Fixas / Parcelamentos. As fixas são templates (não
 * dependem do mês); os parcelamentos são derivados das despesas do mês em
 * exibição, por isso o mês continua valendo no header.
 */
export function RecorrentesPage() {
  const { year, month } = useMonth();
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<RecorrentesCtx['notice']>(null);

  const load = useCallback(async () => {
    try {
      const [r, e, c, a] = await Promise.all([
        api.listRecurring(),
        api.listExpenses(year, month),
        api.listCategories(),
        api.listAccounts(),
      ]);
      setItems(r);
      setExpenses(e);
      setCategories(c);
      setAccounts(a);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="center-pad">
        <div className="spinner" />
      </div>
    );
  }
  if (error) return <div className="alert alert-error">{error}</div>;

  const ctx: RecorrentesCtx = {
    items,
    expenses,
    categories,
    accounts,
    year,
    month,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
    reload: load,
    notice,
    setNotice,
  };

  return <Outlet context={ctx} />;
}
