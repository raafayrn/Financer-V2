import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { springTap } from '../../lib/motion';
import type { ExpenseInput, IncomeInput } from '../../api/types';
import {
  afterCategoryChange,
  afterMonthSettingChange,
  useAccounts,
  useCategories,
  useClearMonth,
  useCreateExpense,
  useCreateIncome,
  useDeleteExpense,
  useDeleteIncome,
  useExpenses,
  useIncomes,
  useSaveIncomeSources,
  useSummary,
  useTrend,
  useUpdateExpense,
  useUpdateIncome,
} from '../../api/queries';
import { useMonth } from '../../context/MonthContext';
import { ExpenseFormModal } from '../../components/ExpenseFormModal';
import { IncomeFormModal } from '../../components/IncomeFormModal';
import { IncomeSourcesModal } from '../../components/IncomeSourcesModal';
import { ManageModal } from '../../components/ManageModal';
import { ClearMonthModal } from '../../components/ClearMonthModal';
import { SkeletonCard, SkeletonLine, SkeletonTiles } from '../../components/Skeleton';
import type { FinancasCtx, ModalState } from './context';

/**
 * Container das três abas de Finanças. As queries (ver api/queries.ts) são
 * compartilhadas por key, então navegar entre Resumo / Lançamentos / Pendentes
 * não refaz requisição nenhuma, e o mês trocado volta do cache.
 */
export function FinancasPage() {
  const { year, month } = useMonth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [searchParams, setSearchParams] = useSearchParams();

  const summaryQuery = useSummary();
  const expensesQuery = useExpenses();
  const incomesQuery = useIncomes();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const trend = useTrend(6);

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const removeExpense = useDeleteExpense();
  const createIncome = useCreateIncome();
  const updateIncome = useUpdateIncome();
  const removeIncome = useDeleteIncome();
  const clearMonth = useClearMonth();
  const saveIncomeSources = useSaveIncomeSources();

  useEffect(() => {
    if (searchParams.get('manage') === '1') {
      setModal({ kind: 'manage' });
      setSearchParams(
        (prev) => {
          prev.delete('manage');
          return prev;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const summary = summaryQuery.data;
  const expenses = expensesQuery.data ?? [];
  const incomes = incomesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  async function handleCreate(data: ExpenseInput) {
    await createExpense.mutateAsync(data);
    setModal({ kind: 'closed' });
  }
  async function handleEdit(id: string, data: ExpenseInput) {
    await updateExpense.mutateAsync({ id, data });
    setModal({ kind: 'closed' });
  }
  async function deleteExpense(id: string) {
    const expense = expenses.find((e) => e.id === id);

    // Numa compra parcelada, apagar só a parcela do mês deixaria as outras
    // soltas nos meses seguintes — então pergunta o que fazer.
    if (expense?.installmentGroupId && (expense.installmentTotal ?? 0) > 1) {
      const apagarGrupo = confirm(
        `"${expense.description}" faz parte de um parcelamento de ${expense.installmentTotal}x.\n\n` +
          'OK = apaga TODAS as parcelas (inclusive as dos próximos meses).\n' +
          'Cancelar = apaga só esta parcela.',
      );
      if (!apagarGrupo && !confirm('Excluir apenas esta parcela?')) return;
      await removeExpense.mutateAsync({ id, group: apagarGrupo });
      return;
    }

    if (!confirm('Excluir este lançamento?')) return;
    await removeExpense.mutateAsync({ id });
  }

  async function handleClearMonth(expenseIds: string[], incomeIds: string[]) {
    await clearMonth.mutateAsync({ year, month, expenseIds, incomeIds });
  }

  async function handleCreateIncome(data: IncomeInput) {
    await createIncome.mutateAsync(data);
    setModal({ kind: 'closed' });
  }
  async function handleEditIncome(id: string, data: IncomeInput) {
    await updateIncome.mutateAsync({ id, data });
    setModal({ kind: 'closed' });
  }
  async function deleteIncome(id: string) {
    if (!confirm('Excluir esta receita?')) return;
    await removeIncome.mutateAsync(id);
  }
  async function handleSaveIncomeSources(
    salaryValue: number | null,
    voucherValue: number | null,
    walletBaseValue: number | null,
  ) {
    await saveIncomeSources.mutateAsync({
      year,
      month,
      salary: salaryValue,
      voucher: voucherValue,
      walletBase: walletBaseValue,
    });
    setModal({ kind: 'closed' });
  }

  // Fluxo de confirmação em lote (vários lançamentos extraídos de uma foto).
  async function handleBatchSubmit(data: ExpenseInput) {
    if (modal.kind !== 'chat-batch') return;
    await createExpense.mutateAsync(data);
    advanceBatch();
  }
  function advanceBatch() {
    if (modal.kind !== 'chat-batch') return;
    const nextIndex = modal.index + 1;
    if (nextIndex >= modal.previews.length) {
      setModal({ kind: 'closed' });
    } else {
      setModal({ kind: 'chat-batch', previews: modal.previews, index: nextIndex });
    }
  }
  // Lança este e todos os demais lançamentos do lote de uma vez, sem revisar um a um.
  async function handleAcceptAllBatch() {
    if (modal.kind !== 'chat-batch') return;
    const remaining = modal.previews.slice(modal.index);
    const defaultAccountId = accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? null;
    for (const preview of remaining) {
      await createExpense.mutateAsync({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        categoryId: preview.categoryId,
        accountId: defaultAccountId,
        recurring: preview.recurring,
      });
    }
    setModal({ kind: 'closed' });
  }

  const modals = (
    <>
      {modal.kind === 'create' && (
        <ExpenseFormModal
          title="Novo lançamento"
          categories={categories}
          accounts={accounts}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreate}
        />
      )}
      {modal.kind === 'edit' && (
        <ExpenseFormModal
          title="Editar lançamento"
          categories={categories}
          accounts={accounts}
          initial={modal.expense}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={(data) => handleEdit(modal.expense.id, data)}
        />
      )}
      {modal.kind === 'chat-batch' && (
        <ExpenseFormModal
          key={modal.index}
          title="Confirmar lançamento"
          progress={`${modal.index + 1} de ${modal.previews.length}`}
          categories={categories}
          accounts={accounts}
          initial={modal.previews[modal.index]}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleBatchSubmit}
          onSkip={advanceBatch}
          onAcceptAll={handleAcceptAllBatch}
        />
      )}
      {modal.kind === 'income' && (
        <IncomeFormModal
          title={modal.defaultAccountId ? 'Nova receita (Pix)' : 'Nova renda'}
          accounts={accounts}
          defaultAccountId={modal.defaultAccountId}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreateIncome}
        />
      )}
      {modal.kind === 'edit-income' && (
        <IncomeFormModal
          title="Editar receita"
          accounts={accounts}
          initial={modal.income}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={(data) => handleEditIncome(modal.income.id, data)}
        />
      )}
      {modal.kind === 'income-sources' && summary && (
        <IncomeSourcesModal
          initialSalary={summary.income.salary}
          initialVoucher={summary.income.voucher}
          initialWalletBase={summary.walletBase}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleSaveIncomeSources}
        />
      )}
      {modal.kind === 'clear-month' && (
        <ClearMonthModal
          year={year}
          month={month}
          expenses={expenses}
          incomes={incomes}
          categoryById={new Map(categories.map((c) => [c.id, c]))}
          onCancel={() => setModal({ kind: 'closed' })}
          onConfirm={handleClearMonth}
        />
      )}
      {modal.kind === 'manage' && (
        <ManageModal
          year={year}
          month={month}
          // O modal cuida do próprio estado e também mexe no orçamento do mês;
          // ao fechar, invalida tudo que ele pode ter mudado.
          onCancel={() => {
            afterCategoryChange(qc);
            afterMonthSettingChange(qc);
            setModal({ kind: 'closed' });
          }}
          onCategoriesChanged={() => afterCategoryChange(qc)}
        />
      )}
    </>
  );

  // Só as queries sem as quais não há tela: as abas leem tudo do contexto.
  const essenciais = [summaryQuery, expensesQuery, incomesQuery, categoriesQuery, accountsQuery];
  const firstError = essenciais.find((q) => q.error)?.error;

  // O véu só cobre a TROCA DE MÊS — enquanto o que está na tela ainda é o mês
  // anterior (placeholder). Refetch em background depois de uma mutação não
  // escurece mais a tela: a lista já foi atualizada de forma otimista.
  const loading =
    summaryQuery.isPlaceholderData ||
    expensesQuery.isPlaceholderData ||
    incomesQuery.isPlaceholderData;

  // Primeiro carregamento: o desenho do Resumo (a aba índice) em vez do
  // spinner de tela cheia. Ver o padrão em components/Skeleton.tsx.
  if (!summary && essenciais.some((q) => q.isPending)) {
    return (
      <div className="ms-stack">
        <section className="ms-card ms-hero">
          <SkeletonLine width="34%" height="11px" />
          <SkeletonLine width="52%" height="40px" />
          <SkeletonLine width="70%" height="13px" />
        </section>
        <SkeletonTiles count={3} />
        <SkeletonCard rows={4} />
        <SkeletonCard rows={3} />
      </div>
    );
  }
  if (firstError) {
    return (
      <div className="alert alert-error">
        {firstError instanceof ApiError ? firstError.message : 'Erro ao carregar dados.'}
      </div>
    );
  }
  if (!summary) return null;

  const ctx: FinancasCtx = {
    summary,
    expenses,
    incomes,
    categories,
    accounts,
    trend: trend.data,
    year,
    month,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
    walletAccountId: accounts.find((a) => a.kind === 'WALLET')?.id,
    openModal: setModal,
    // As abas continuam podendo pedir "recarrega isso" (ex.: o assistente
    // lançou um gasto). Agora é invalidação de cache, não refetch na mão.
    reload: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['income'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
    },
    deleteExpense,
    deleteIncome,
  };

  return (
    <div style={{ position: 'relative' }}>
      <motion.div
        animate={{ opacity: loading ? 0.45 : 1 }}
        style={{ pointerEvents: loading ? 'none' : 'auto' }}
      >
        <Outlet context={ctx} />
      </motion.div>

      <AnimatePresence>
        {loading && (
          <motion.div
            className="loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springTap}
          >
            <div className="spinner" />
          </motion.div>
        )}
      </AnimatePresence>

      {modals}
    </div>
  );
}
