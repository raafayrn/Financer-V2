import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { springSheet, springSmooth, springTap } from '../lib/motion';
import type {
  Account,
  AccountKind,
  Category,
  ChatPreview,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  InvestmentSummary,
  Summary,
} from '../api/types';
import { useMonth } from '../context/MonthContext';
import { useShell } from '../context/ShellContext';
import { MonthNavigator } from '../components/MonthNavigator';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { ReportsPage } from './ReportsPage';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { IncomeFormModal } from '../components/IncomeFormModal';
import { IncomeSourcesModal } from '../components/IncomeSourcesModal';
import { Dropdown } from '../components/Dropdown';
import { formatCurrency, formatDayMonth, monthShort } from '../utils/format';
import { ChevronDownIcon, EditIcon, RepeatIcon, TrashIcon } from '../components/icons';
import { ManageModal } from '../components/ManageModal';
import { NEUTRAL_COLOR } from '../utils/palette';
import { RecurringModal } from '../components/RecurringModal';

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

type SortMode = 'date-desc' | 'amount-desc' | 'amount-asc';
type TypeFilter = 'all' | AccountKind;

const TYPE_FILTER_LABEL: Record<AccountKind, string> = {
  FOOD_VOUCHER: 'VR',
  WALLET: 'Pix',
  CREDIT_CARD: 'Crédito',
};

const STATUS_MESSAGE: Record<Summary['status'], string> = {
  ok: 'Dentro da sua renda disponível',
  warning: 'Atenção: perto de gastar toda a renda',
  over: 'Você já gastou mais do que ganhou',
};

interface TrendPoint {
  year: number;
  month: number;
  spent: number;
}

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

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; expense: Expense }
  | { kind: 'chat-batch'; previews: ChatPreview[]; index: number }
  | { kind: 'income'; defaultAccountId?: string }
  | { kind: 'edit-income'; income: Income }
  | { kind: 'income-sources' }
  | { kind: 'manage' }
  | { kind: 'recurring' };

type LedgerItem =
  | { kind: 'expense'; data: Expense }
  | { kind: 'income'; data: Income };

const overviewContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

export function DashboardPage() {
  const { year, month } = useMonth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [investments, setInvestments] = useState<InvestmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [listCollapsed, setListCollapsed] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshKey, pendingPreviews, setPendingPreviews } = useShell();

  /** Mês é o padrão; "Ano" abre o que antes era a tela de Relatórios. */
  const [range, setRange] = useState<'mes' | 'ano'>(
    searchParams.get('range') === 'ano' ? 'ano' : 'mes',
  );
  /** Busca na lista de lançamentos — antes achar algo antigo exigia rolar. */
  const [query, setQuery] = useState('');

  useEffect(() => {
    const intent = searchParams.get('new');
    let changed = false;
    if (searchParams.get('manage') === '1') {
      setModal({ kind: 'manage' });
      searchParams.delete('manage');
      changed = true;
    }
    // Intenções vindas do botão "+" global do Layout.
    if (intent === 'expense') setModal({ kind: 'create' });
    else if (intent === 'income') setModal({ kind: 'income' });
    if (intent) {
      searchParams.delete('new');
      changed = true;
    }
    if (changed) setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // O assistente vive no Layout; quando ele detecta lançamentos, esta tela é
  // quem abre o fluxo de confirmação.
  useEffect(() => {
    if (pendingPreviews && pendingPreviews.length > 0) {
      setModal({ kind: 'chat-batch', previews: pendingPreviews, index: 0 });
      setPendingPreviews(null);
    }
  }, [pendingPreviews, setPendingPreviews]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');

  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [s, e, inc, c, a, invest] = await Promise.all([
        api.getSummary(year, month),
        api.listExpenses(year, month),
        api.listIncome(year, month),
        api.listCategories(),
        api.listAccounts(),
        api.getInvestmentSummary(year),
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
      setInvestments(invest);

      const spentByKey = new Map<string, number>();
      for (const r of reports) {
        for (const m of r.months) spentByKey.set(`${r.year}-${m.month}`, m.spent);
      }
      setTrend(wanted.map((w) => ({ year: w.year, month: w.month, spent: spentByKey.get(`${w.year}-${w.month}`) ?? 0 })));
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar dados.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [year, month]);

  // `refreshKey` muda quando o assistente global salva algo em outra tela.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

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
  async function handleDelete(id: string) {
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
  async function handleDeleteIncome(id: string) {
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

  const walletAccountId = accounts.find((a) => a.kind === 'WALLET')?.id;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const ledger: LedgerItem[] = [
    ...expenses.map((data): LedgerItem => ({ kind: 'expense', data })),
    ...incomes.map((data): LedgerItem => ({ kind: 'income', data })),
  ].sort((a, b) => (a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : 0));

  const filtersActive =
    categoryFilter !== 'all' || typeFilter !== 'all' || recurringOnly || sortMode !== 'date-desc';

  function resetFilters() {
    setCategoryFilter('all');
    setTypeFilter('all');
    setRecurringOnly(false);
    setSortMode('date-desc');
  }

  const queryNorm = query.trim().toLowerCase();

  let filteredLedger = ledger.filter((item) => {
    if (queryNorm) {
      const cat = item.kind === 'expense' ? categoryById.get(item.data.categoryId ?? '') : undefined;
      const haystack = `${item.data.description} ${cat?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(queryNorm)) return false;
    }
    if (categoryFilter !== 'all' && (item.kind !== 'expense' || item.data.categoryId !== categoryFilter)) {
      return false;
    }
    if (typeFilter !== 'all') {
      const acc = item.data.accountId ? accountById.get(item.data.accountId) : undefined;
      if (acc?.kind !== typeFilter) return false;
    }
    if (recurringOnly && (item.kind !== 'expense' || !item.data.recurring)) {
      return false;
    }
    return true;
  });

  if (sortMode === 'amount-desc') {
    filteredLedger = [...filteredLedger].sort((a, b) => b.data.amount - a.data.amount);
  } else if (sortMode === 'amount-asc') {
    filteredLedger = [...filteredLedger].sort((a, b) => a.data.amount - b.data.amount);
  }

  /**
   * Intercala cabeçalhos de dia com o total gasto naquele dia. Antes a lista
   * era um rolo contínuo sem marco temporal: dava para rolar trinta linhas sem
   * saber em que dia se estava. Só faz sentido na ordenação por data — nas
   * outras a sequência não é cronológica.
   */
  const groupByDay = sortMode === 'date-desc';
  const ledgerRows: (LedgerItem | { kind: 'day'; date: string; total: number })[] = [];
  if (groupByDay) {
    let currentDay: string | null = null;
    for (let idx = 0; idx < filteredLedger.length; idx++) {
      const item = filteredLedger[idx];
      if (item.data.date !== currentDay) {
        currentDay = item.data.date;
        let dayTotal = 0;
        for (let j = idx; j < filteredLedger.length && filteredLedger[j].data.date === currentDay; j++) {
          const it = filteredLedger[j];
          dayTotal += it.kind === 'expense' ? -it.data.amount : it.data.amount;
        }
        ledgerRows.push({ kind: 'day', date: currentDay, total: dayTotal });
      }
      ledgerRows.push(item);
    }
  } else {
    ledgerRows.push(...filteredLedger);
  }

  const totalAvailable = summary ? summary.income.total + summary.walletBalance : 0;
  // VR e Salário restantes (mostrados no card "Ainda posso gastar" — a
  // Carteira já é sempre líquida). Salário é o "limite da fatura": tudo que
  // for gasto no cartão (fixo + variável, ou seja, não-Pix e não-VR) sai dele.
  const voucherRemaining = summary ? summary.income.voucher - summary.accounts.foodVoucher : 0;
  const salaryRemaining = summary ? summary.income.salary - (summary.accounts.fixed + summary.accounts.variable) : 0;
  const maxTrend = Math.max(1, ...trend.map((t) => t.spent));

  return (
    <div className="page">
      <PageHeader title="Finanças" />

      {/* Período: "Ano" entrega o que era a tela de Relatórios, sem troca de
          contexto — comparar meses virou um toque. */}
      <div className="range-bar">
        <div className="segmented">
          <button
            className={`segmented-item${range === 'mes' ? ' active' : ''}`}
            onClick={() => setRange('mes')}
            aria-pressed={range === 'mes'}
          >
            Mês
          </button>
          <button
            className={`segmented-item${range === 'ano' ? ' active' : ''}`}
            onClick={() => setRange('ano')}
            aria-pressed={range === 'ano'}
          >
            Ano
          </button>
        </div>
        {range === 'mes' && <MonthNavigator />}
      </div>

      {range === 'ano' ? (
        <ReportsPage embedded />
      ) : loading && !summary ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : summary ? (
        <div className="dashboard-content">
          <motion.div
            className="dashboard-stack"
            animate={{ opacity: loading ? 0.45 : 1 }}
            transition={springSmooth}
            style={{ pointerEvents: loading ? 'none' : 'auto' }}
          >
          <motion.div
            className="overview-grid"
            variants={overviewContainer}
            initial="hidden"
            animate="show"
          >
            {/* Destaque principal: quanto ainda posso gastar (renda − gasto) */}
            <motion.section className={`hero card status-${summary.status}`} variants={overviewItem}>
              <span className="hero-label">Ainda posso gastar</span>
              <span className="hero-value">{formatCurrency(summary.remaining)}</span>
              <span className="hero-status">{STATUS_MESSAGE[summary.status]}</span>

              <ProgressBar percent={summary.percentUsed} status={summary.status} />

              <div className="hero-details">
                <div>
                  <span className="detail-label">Salário</span>
                  <span className="detail-value">{formatCurrency(salaryRemaining)}</span>
                </div>
                <div>
                  <span className="detail-label">Vale (VR)</span>
                  <span className="detail-value">{formatCurrency(voucherRemaining)}</span>
                </div>
                <div>
                  <span className="detail-label">Carteira</span>
                  <span className="detail-value">{formatCurrency(summary.walletBalance)}</span>
                </div>
              </div>
            </motion.section>

            {/* Renda do mês (editável) */}
            <motion.div className="stat-card overview-item" variants={overviewItem}>
              <div className="stat-card-head">
                <span className="stat-label">Renda do mês</span>
                <button
                  className="icon-btn"
                  title="Editar salário e VR"
                  onClick={() => setModal({ kind: 'income-sources' })}
                >
                  <EditIcon />
                </button>
              </div>
              <span className="stat-value">{formatCurrency(totalAvailable)}</span>
              <ul className="income-source-list">
                <li>
                  <span>Salário</span>
                  <span>{formatCurrency(summary.income.salary)}</span>
                </li>
                <li>
                  <span>Vale (VR)</span>
                  <span>{formatCurrency(summary.income.voucher)}</span>
                </li>
                <li>
                  <span>Carteira (Pix)</span>
                  <span>{formatCurrency(summary.walletBalance)}</span>
                </li>
                {summary.income.extra > 0 && (
                  <li>
                    <span>Outros</span>
                    <span>{formatCurrency(summary.income.extra)}</span>
                  </li>
                )}
              </ul>
              <div className="income-add-row">
                <button
                  className="btn-ghost btn-sm income-add-btn"
                  onClick={() => setModal({ kind: 'income', defaultAccountId: walletAccountId })}
                >
                  + Receita Pix
                </button>
                <button
                  className="btn-ghost btn-sm income-add-btn"
                  onClick={() => setModal({ kind: 'income' })}
                >
                  + Renda avulsa
                </button>
              </div>
            </motion.div>

            {/* Gasto por conta de origem */}
            <motion.section className="card overview-item" variants={overviewItem}>
              <h3 className="section-title">Gasto até agora</h3>
              <ul className="account-breakdown">
                <li>
                  <span>Fixos (cartão)</span>
                  <span>{formatCurrency(summary.accounts.fixed)}</span>
                </li>
                <li>
                  <span>Variáveis (cartão)</span>
                  <span>{formatCurrency(summary.accounts.variable)}</span>
                </li>
                <li style={{ fontWeight: 600 }}>
                  <span>Fatura estimada</span>
                  <span>{formatCurrency(summary.accounts.fixed + summary.accounts.variable)}</span>
                </li>
                <li>
                  <span>Vale-alimentação</span>
                  <span>{formatCurrency(summary.accounts.foodVoucher)}</span>
                </li>
                <li>
                  <span>Carteira (Pix)</span>
                  <span>{formatCurrency(summary.accounts.wallet)}</span>
                </li>
                <li className="account-breakdown-total">
                  <span>Total</span>
                  <span>{formatCurrency(summary.accounts.total)}</span>
                </li>
              </ul>
            </motion.section>

            {/* Saldo investido — a porta de entrada de Investimentos, que saiu
                da navegação principal. Também é o que finalmente conecta os
                dois mundos: antes o dinheiro investido não aparecia aqui. */}
            {investments && (
              <motion.button
                className="card overview-item invest-card"
                variants={overviewItem}
                onClick={() => navigate('/investimentos')}
                whileTap={{ scale: 0.98 }}
                transition={springTap}
              >
                <span className="stat-label">Saldo investido</span>
                <span className="stat-value money">{formatCurrency(investments.totalBalance)}</span>
                <span className="invest-card-meta">
                  {investments.totals.netYear >= 0 ? 'Aporte líquido' : 'Resgate líquido'} em {year}:{' '}
                  <strong className={investments.totals.netYear >= 0 ? 'pos' : 'neg'}>
                    {formatCurrency(Math.abs(investments.totals.netYear))}
                  </strong>
                </span>
                <span className="invest-card-cta">Ver carteira →</span>
              </motion.button>
            )}

            {/* Gasto por categoria — ocupa o espaço dos 2 cards removidos */}
            {summary.byCategory.length > 0 && (
              <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
                <h3 className="section-title">Gasto por categoria</h3>
                <ul className="cat-list">
                  {summary.byCategory.map((c) => {
                    const pct =
                      summary.totalSpent > 0 ? (c.spent / summary.totalSpent) * 100 : 0;
                    return (
                      <li key={c.categoryId ?? 'none'} className="cat-row">
                        <div className="cat-head">
                          <span className="cat-dot" style={{ background: c.color }} />
                          <span className="cat-name">{c.categoryName}</span>
                          <span className="cat-value">{formatCurrency(c.spent)}</span>
                        </div>
                        <div className="cat-bar">
                          <div
                            className="cat-bar-fill"
                            style={{ width: `${pct}%`, background: c.color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            )}
          </motion.div>

          {/* O assistente subiu para o Layout: agora está disponível em
              qualquer tela, não só aqui. */}

          {/* Lista de lançamentos (despesas + receitas juntas) */}
          <section className="card">
            <div className="section-head">
              <div className="section-head-start">
                <motion.button
                  className="icon-btn-outline"
                  title={listCollapsed ? 'Expandir lançamentos' : 'Minimizar lançamentos'}
                  aria-expanded={!listCollapsed}
                  onClick={() => setListCollapsed((c) => !c)}
                  whileTap={{ scale: 0.9 }}
                  transition={springTap}
                >
                  <motion.span
                    style={{ display: 'flex' }}
                    animate={{ rotate: listCollapsed ? -90 : 0 }}
                    transition={springTap}
                  >
                    <ChevronDownIcon />
                  </motion.span>
                </motion.button>
                <h3 className="section-title">Lançamentos ({filteredLedger.length})</h3>
              </div>
              <div className="section-head-actions">
                <motion.button
                  className="icon-btn-outline"
                  title="Despesas fixas (lançadas automaticamente todo mês)"
                  onClick={() => setModal({ kind: 'recurring' })}
                  whileTap={{ scale: 0.9 }}
                  transition={springTap}
                >
                  <RepeatIcon />
                </motion.button>
                <motion.button
                  className={`icon-btn-outline ${filtersActive ? 'icon-btn-outline-active' : ''}`}
                  title="Filtrar lançamentos"
                  onClick={() => setFiltersOpen((o) => !o)}
                  whileTap={{ scale: 0.9 }}
                  transition={springTap}
                >
                  <FilterIcon />
                </motion.button>
                <motion.button
                  className="btn-primary btn-sm"
                  onClick={() => setModal({ kind: 'create' })}
                  whileTap={{ scale: 0.95 }}
                  transition={springTap}
                >
                  + Novo
                </motion.button>
              </div>
            </div>

            {!listCollapsed && (
              <>
                <div className="search-row">
                  <input
                    type="search"
                    className="search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por descrição ou categoria…"
                    aria-label="Buscar lançamentos"
                  />
                  {query && (
                    <button className="link-btn" onClick={() => setQuery('')}>
                      Limpar
                    </button>
                  )}
                </div>

                {/* Filtros ativos como chips removíveis. Antes o painel ficava
                    aberto ocupando espaço permanente e não havia sinal de qual
                    filtro estava valendo. */}
                {filtersActive && (
                  <div className="chip-row active-filters">
                    {categoryFilter !== 'all' && (
                      <button className="chip chip-removable" onClick={() => setCategoryFilter('all')}>
                        {categoryById.get(categoryFilter)?.name ?? 'Categoria'} ✕
                      </button>
                    )}
                    {typeFilter !== 'all' && (
                      <button className="chip chip-removable" onClick={() => setTypeFilter('all')}>
                        {TYPE_FILTER_LABEL[typeFilter]} ✕
                      </button>
                    )}
                    {recurringOnly && (
                      <button className="chip chip-removable" onClick={() => setRecurringOnly(false)}>
                        Só fixas ✕
                      </button>
                    )}
                    {sortMode !== 'date-desc' && (
                      <button className="chip chip-removable" onClick={() => setSortMode('date-desc')}>
                        {sortMode === 'amount-desc' ? 'Maior valor' : 'Menor valor'} ✕
                      </button>
                    )}
                    <button className="link-btn" onClick={resetFilters}>
                      Limpar tudo
                    </button>
                  </div>
                )}
              </>
            )}

            <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                className="filter-panel"
                style={{ overflow: 'hidden' }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springSheet}
              >
                <div className="filter-row">
                  <span className="filter-label">Categoria</span>
                  <Dropdown
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    ariaLabel="Categoria"
                    options={[
                      { value: 'all', label: 'Todas' },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </div>

                <div className="filter-row">
                  <span className="filter-label">Tipo</span>
                  <div className="chip-row">
                    <button
                      className={`chip ${typeFilter === 'all' ? 'chip-active' : ''}`}
                      onClick={() => setTypeFilter('all')}
                    >
                      Todos
                    </button>
                    {(['FOOD_VOUCHER', 'WALLET', 'CREDIT_CARD'] as AccountKind[]).map((kind) => (
                      <button
                        key={kind}
                        className={`chip ${typeFilter === kind ? 'chip-active' : ''}`}
                        onClick={() => setTypeFilter(kind)}
                      >
                        {TYPE_FILTER_LABEL[kind]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="filter-row">
                  <span className="filter-label">Ordenar por</span>
                  <div className="chip-row">
                    <button
                      className={`chip ${sortMode === 'date-desc' ? 'chip-active' : ''}`}
                      onClick={() => setSortMode('date-desc')}
                    >
                      Mais recentes
                    </button>
                    <button
                      className={`chip ${sortMode === 'amount-desc' ? 'chip-active' : ''}`}
                      onClick={() => setSortMode('amount-desc')}
                    >
                      Valor ↓
                    </button>
                    <button
                      className={`chip ${sortMode === 'amount-asc' ? 'chip-active' : ''}`}
                      onClick={() => setSortMode('amount-asc')}
                    >
                      Valor ↑
                    </button>
                  </div>
                </div>

                <label className="switch-row">
                  <span>Somente recorrentes</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={recurringOnly}
                      onChange={(e) => setRecurringOnly(e.target.checked)}
                    />
                    <span className="switch-track">
                      <span className="switch-thumb" />
                    </span>
                  </span>
                </label>

                {filtersActive && (
                  <button className="link-btn filter-clear" onClick={resetFilters}>
                    Limpar filtros
                  </button>
                )}
              </motion.div>
            )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
            {!listCollapsed && (
              <motion.div
                style={{ overflow: 'hidden' }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springSheet}
              >
            {filteredLedger.length === 0 ? (
              <p className="empty">
                {ledger.length === 0 ? 'Nenhum lançamento neste mês.' : 'Nenhum lançamento com esses filtros.'}
              </p>
            ) : (
              <ul className="exp-list">
                <AnimatePresence initial={false}>
                {ledgerRows.map((item) => {
                  if (item.kind === 'day') {
                    return (
                      <li key={`day-${item.date}`} className="day-header">
                        <span className="day-header-date">{formatDayMonth(item.date)}</span>
                        <span className={`day-header-total money ${item.total < 0 ? 'neg' : 'pos'}`}>
                          {item.total < 0 ? '−' : '+'}
                          {formatCurrency(Math.abs(item.total))}
                        </span>
                      </li>
                    );
                  }
                  if (item.kind === 'expense') {
                    const e = item.data;
                    const cat = e.categoryId ? categoryById.get(e.categoryId) : undefined;
                    return (
                      <motion.li
                        key={`exp-${e.id}`}
                        className="exp-row"
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={springSmooth}
                        style={{ overflow: 'hidden' }}
                      >
                        <span
                          className="exp-dot"
                          style={{ background: cat?.color ?? NEUTRAL_COLOR }}
                        />
                        <div className="exp-main">
                          <span className="exp-desc">
                            {e.description}
                            {e.recurringExpenseId ? (
                              <span className="tag tag-auto" title="Lançada automaticamente pela despesa fixa">
                                fixa
                              </span>
                            ) : e.installmentGroupId ? (
                              <span
                                className="tag tag-installment"
                                title={`Parcela ${e.installmentNo} de ${e.installmentTotal}`}
                              >
                                {e.installmentNo}/{e.installmentTotal}
                              </span>
                            ) : (
                              e.recurring && <span className="tag">recorrente</span>
                            )}
                          </span>
                          <span className="exp-meta">
                            {formatDayMonth(e.date)} · {cat?.name ?? 'Sem categoria'}
                          </span>
                        </div>
                        <span className="exp-amount exp-amount-neg">−{formatCurrency(e.amount)}</span>
                        <div className="exp-actions">
                          <button
                            className="icon-btn"
                            title="Editar"
                            onClick={() => setModal({ kind: 'edit', expense: e })}
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="icon-btn"
                            title="Excluir"
                            onClick={() => handleDelete(e.id)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </motion.li>
                    );
                  }

                  const i = item.data;
                  const acc = i.accountId ? accountById.get(i.accountId) : undefined;
                  return (
                    <motion.li
                      key={`inc-${i.id}`}
                      className="exp-row"
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={springSmooth}
                      style={{ overflow: 'hidden' }}
                    >
                      <span className="exp-dot" style={{ background: 'var(--ok)' }} />
                      <div className="exp-main">
                        <span className="exp-desc">
                          {i.description}
                          <span className="tag tag-income">receita</span>
                        </span>
                        <span className="exp-meta">
                          {formatDayMonth(i.date)} · {acc?.name ?? 'Sem conta'}
                        </span>
                      </div>
                      <span className="exp-amount exp-amount-pos">+{formatCurrency(i.amount)}</span>
                      <div className="exp-actions">
                        <button
                          className="icon-btn"
                          title="Editar"
                          onClick={() => setModal({ kind: 'edit-income', income: i })}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="icon-btn"
                          title="Excluir"
                          onClick={() => handleDeleteIncome(i.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
                </AnimatePresence>
              </ul>
            )}
              </motion.div>
            )}
            </AnimatePresence>
          </section>

          {/* Gráfico: gasto nos últimos meses */}
          <section className="card">
            <h3 className="section-title">Gastos nos últimos meses</h3>
            <div className="chart">
              {trend.map((t) => {
                const h = maxTrend > 0 ? (t.spent / maxTrend) * 100 : 0;
                const isCurrent = t.year === year && t.month === month;
                return (
                  <div
                    key={`${t.year}-${t.month}`}
                    className="chart-col"
                    title={`${monthShort(t.month)}/${t.year}: ${formatCurrency(t.spent)}`}
                  >
                    <div className="chart-bars">
                      <div
                        className={`chart-spent ${isCurrent ? '' : 'trend-muted'}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="chart-label">{monthShort(t.month)}</span>
                  </div>
                );
              })}
            </div>
          </section>
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
        </div>
      ) : null}

      {/* Modais */}
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
      {modal.kind === 'manage' && (
        <ManageModal
          year={year}
          month={month}
          onCancel={() => setModal({ kind: 'closed' })}
          onCategoriesChanged={() => void load()}
        />
      )}
      {modal.kind === 'recurring' && (
        <RecurringModal
          year={year}
          month={month}
          categories={categories}
          accounts={accounts}
          onCancel={() => setModal({ kind: 'closed' })}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
