import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { useAccounts, useCategories, useExpenses, useRecurring } from '../../api/queries';
import { SkeletonCard } from '../../components/Skeleton';
import { useMonth } from '../../context/MonthContext';
import type { RecorrentesCtx } from './context';

/**
 * Container das abas Fixas / Parcelamentos. As fixas são templates (não
 * dependem do mês, key global `['recurring']`); os parcelamentos são derivados
 * das despesas do mês em exibição, por isso o mês continua valendo no header.
 */
export function RecorrentesPage() {
  const { year, month } = useMonth();
  const qc = useQueryClient();
  const [notice, setNotice] = useState<RecorrentesCtx['notice']>(null);

  const recurringQuery = useRecurring();
  const expensesQuery = useExpenses();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();

  const queries = [recurringQuery, expensesQuery, categoriesQuery, accountsQuery];
  const firstError = queries.find((q) => q.error)?.error;

  if (queries.some((q) => q.isPending)) {
    return (
      <div className="ms-stack">
        <SkeletonCard rows={5} />
      </div>
    );
  }
  if (firstError) {
    return (
      <div className="alert alert-error">
        {firstError instanceof ApiError ? firstError.message : 'Erro ao carregar.'}
      </div>
    );
  }

  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  const ctx: RecorrentesCtx = {
    items: recurringQuery.data ?? [],
    expenses: expensesQuery.data ?? [],
    categories,
    accounts,
    year,
    month,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
    // As mutações de fixa já invalidam sozinhas (afterRecurringChange). Isto
    // fica para quem precisa forçar, e é invalidação — não refetch na mão.
    reload: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['recurring'] }),
        qc.invalidateQueries({ queryKey: ['expenses'] }),
      ]);
    },
    notice,
    setNotice,
  };

  return <Outlet context={ctx} />;
}
