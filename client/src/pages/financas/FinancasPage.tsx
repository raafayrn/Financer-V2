import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { springTap } from '../../lib/motion';
import type {
  Account,
  Category,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  Summary,
} from '../../api/types';
import { useMonth } from '../../context/MonthContext';
import { ExpenseFormModal } from '../../components/ExpenseFormModal';
import { IncomeFormModal } from '../../components/IncomeFormModal';
import { IncomeSourcesModal } from '../../components/IncomeSourcesModal';
import { ManageModal } from '../../components/ManageModal';
import { ClearMonthModal } from '../../components/ClearMonthModal';
import type { FinancasCtx, ModalState, TrendPoint } from './context';

/** Últimos `n` meses (mais antigo → mais novo) terminando em (year, month). */
function lastMonths(year: number, month: number, n: number): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < n; i++) {
    result.unshift({ year: y, month: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return result;
}

/**
 * Container das três abas de Finanças. Carrega os dados do mês uma única vez,
 * expõe tudo pelo contexto do Outlet e concentra os modais — assim navegar
 * entre Resumo / Lançamentos / Categorias é instantâneo.
 */
export function FinancasPage() {
  const { year, month } = useMonth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [searchParams, setSearchParams] = useSearchParams();

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

  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [s, e, inc, c, a] = await Promise.all([
        api.getSummary(year, month),
        api.listExpenses(year, month),
        api.listIncome(year, month),
        api.listCategories(),
        api.listAccounts(),
      ]);

      const wanted = lastMonths(year, month, 6);
      const years = Array.from(new Set(wanted.map((w) => w.year)));
      const reports = await Promise.all(years.map((y) => api.getMonthlyReport(y)));

      if (requestId !== loadRequestRef.current) return; // uma requisição mais nova já resolveu

      setSummary(s);
      setExpenses(e);
      setIncomes(inc);
      setCategories(c);
      setAccounts(a);

      const spentByKey = new Map<string, number>();
      for (const r of reports) {
        for (const m of r.months) spentByKey.set(`${r.year}-${m.month}`, m.spent);
      }
      setTrend(
        wanted.map((w) => ({
          year: w.year,
          month: w.month,
          spent: spentByKey.get(`${w.year}-${w.month}`) ?? 0,
        })),
      );
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar dados.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(data: ExpenseInput) {
    await api.createExpense(data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleEdit(id: string, data: ExpenseInput) {
    await api.updateExpense(id, data);
    setModal({ kind: 'closed' });
    await load();
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
      await api.deleteExpense(id, apagarGrupo);
      await load();
      return;
    }

    if (!confirm('Excluir este lançamento?')) return;
    await api.deleteExpense(id);
    await load();
  }

  async function handleClearMonth(expenseIds: string[], incomeIds: string[]) {
    await api.clearMonth(year, month, expenseIds, incomeIds);
    await load();
  }

  async function handleCreateIncome(data: IncomeInput) {
    await api.createIncome(data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleEditIncome(id: string, data: IncomeInput) {
    await api.updateIncome(id, data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function deleteIncome(id: string) {
    if (!confirm('Excluir esta receita?')) return;
    await api.deleteIncome(id);
    await load();
  }
  async function handleSaveIncomeSources(
    salaryValue: number | null,
    voucherValue: number | null,
    walletBaseValue: number | null,
  ) {
    const tasks: Promise<unknown>[] = [];
    if (salaryValue !== null) tasks.push(api.setSalary(year, month, salaryValue));
    if (voucherValue !== null) tasks.push(api.setVoucher(year, month, voucherValue));
    if (walletBaseValue !== null) tasks.push(api.setWalletBase(year, month, walletBaseValue));
    await Promise.all(tasks);
    setModal({ kind: 'closed' });
    await load();
  }

  // Fluxo de confirmação em lote (vários lançamentos extraídos de uma foto).
  async function handleBatchSubmit(data: ExpenseInput) {
    if (modal.kind !== 'chat-batch') return;
    await api.createExpense(data);
    advanceBatch();
  }
  function advanceBatch() {
    if (modal.kind !== 'chat-batch') return;
    const nextIndex = modal.index + 1;
    if (nextIndex >= modal.previews.length) {
      setModal({ kind: 'closed' });
      void load();
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
      await api.createExpense({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        categoryId: preview.categoryId,
        accountId: defaultAccountId,
        recurring: preview.recurring,
      });
    }
    setModal({ kind: 'closed' });
    await load();
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
          onCancel={() => setModal({ kind: 'closed' })}
          onCategoriesChanged={() => void load()}
        />
      )}
    </>
  );

  if (loading && !summary) {
    return (
      <div className="center-pad">
        <div className="spinner" />
      </div>
    );
  }
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!summary) return null;

  const ctx: FinancasCtx = {
    summary,
    expenses,
    incomes,
    categories,
    accounts,
    trend,
    year,
    month,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    accountById: new Map(accounts.map((a) => [a.id, a])),
    walletAccountId: accounts.find((a) => a.kind === 'WALLET')?.id,
    openModal: setModal,
    reload: () => void load(),
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
