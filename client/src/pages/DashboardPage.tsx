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
  RecurringExpense,
  Summary,
} from '../api/types';
import { useMonth } from '../context/MonthContext';
import { useShell } from '../context/ShellContext';
import { MonthNavigator } from '../components/MonthNavigator';
import { ProgressBar } from '../components/ProgressBar';
import { ReportsPage } from './ReportsPage';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { IncomeFormModal } from '../components/IncomeFormModal';
import { IncomeSourcesModal } from '../components/IncomeSourcesModal';
import { Dropdown } from '../components/Dropdown';
import { formatCurrency, formatDayMonth } from '../utils/format';
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
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [pulling, setPulling] = useState(false);
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
      const [s, e, inc, c, a, rec] = await Promise.all([
        api.getSummary(year, month),
        api.listExpenses(year, month),
        api.listIncome(year, month),
        api.listCategories(),
        api.listAccounts(),
        api.listRecurring(),
      ]);

      if (requestId !== loadRequestRef.current) return; // uma requisição mais nova já resolveu

      setSummary(s);
      setExpenses(e);
      setIncomes(inc);
      setCategories(c);
      setAccounts(a);
      setRecurring(rec);
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

  /**
   * Puxa as fixas do mês para o mês exibido. Idempotente no backend — clicar
   * de novo não duplica, só completa o que faltar.
   */
  async function handlePullRecurring() {
    setPulling(true);
    try {
      await api.materializeRecurring(year, month);
      await load();
    } finally {
      setPulling(false);
    }
  }

  // ---- Compromissos fixos do mês ----------------------------------------
  // A fonte de verdade do "o que vou pagar todo mês" são os templates, não o
  // balde `accounts.fixed` do resumo: aquele só enxerga recorrente no cartão,
  // e uma fixa paga no Pix ou no VR cairia em outro balde.
  const activeRecurring = recurring.filter((r) => r.active);
  const fixedTotal = activeRecurring.reduce((sum, r) => sum + r.amount, 0);
  const launchedTemplateIds = new Set(
    expenses.map((e) => e.recurringExpenseId).filter((id): id is string => !!id),
  );
  const fixedLaunched = activeRecurring
    .filter((r) => launchedTemplateIds.has(r.id))
    .reduce((sum, r) => sum + r.amount, 0);
  const fixedPending = fixedTotal - fixedLaunched;
  const pendingCount = activeRecurring.filter((r) => !launchedTemplateIds.has(r.id)).length;

  const totalAvailable = summary ? summary.income.total + summary.walletBalance : 0;
  // Tudo que sai do mês: o compromisso fixo mais o que já se gastou à solta.
  // É ESTE o subtraendo da fórmula do topo — mostrar só as fixas fazia a conta
  // não fechar na tela (4.400 − 1.517 ≠ 2.523).
  const variableSpent = summary?.accounts.variable ?? 0;
  const outflowTotal = fixedTotal + variableSpent;
  // Sobra depois de honrar os compromissos fixos — o número de planejamento.
  const freeToSpend = totalAvailable - outflowTotal;

  /** Composição da receita. Só as parcelas positivas viram barra; a carteira
   *  negativa é uma dedução, não um pedaço do bolo. */
  const incomeParts = summary
    ? [
        { key: 'salary', label: 'Salário', value: summary.income.salary, tone: 'primary' },
        { key: 'voucher', label: 'Vale (VR)', value: summary.income.voucher, tone: 'vr' },
        ...(summary.income.extra > 0
          ? [{ key: 'extra', label: 'Outros', value: summary.income.extra, tone: 'ok' }]
          : []),
        { key: 'wallet', label: 'Carteira (Pix)', value: summary.walletBalance, tone: 'wallet' },
      ]
    : [];
  const incomePositive = incomeParts.reduce((s, p) => s + Math.max(0, p.value), 0);

  const outflowParts = [
    { key: 'launched', label: 'Fixas lançadas', value: fixedLaunched, tone: 'fixed' },
    { key: 'pending', label: 'Fixas a lançar', value: fixedPending, tone: 'pending' },
    { key: 'variable', label: 'Gasto variável', value: variableSpent, tone: 'variable' },
  ];
  // VR e Salário restantes (mostrados no card "Ainda posso gastar" — a
  // Carteira já é sempre líquida). Salário é o "limite da fatura": tudo que
  // for gasto no cartão (fixo + variável, ou seja, não-Pix e não-VR) sai dele.
  const voucherRemaining = summary ? summary.income.voucher - summary.accounts.foodVoucher : 0;
  const salaryRemaining = summary ? summary.income.salary - (summary.accounts.fixed + summary.accounts.variable) : 0;

  return (
    <div className="page">
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
          <motion.div variants={overviewContainer} initial="hidden" animate="show">
            {/* ================= FAIXA 1 — a conta do mês =================
                Receita − Fixas = Livre. Os três números são uma frase só, então
                moram num card só, lidos da esquerda para a direita. Antes o topo
                era um número único ("ainda posso gastar") que misturava tudo e
                escondia justamente a estrutura em que o Rafael pensa. */}
            <motion.section className="fin-flow card" variants={overviewItem}>
              <div className="fin-flow-step">
                <div className="fin-flow-head">
                  <span className="fin-flow-label">Receita total</span>
                  <button
                    className="icon-btn"
                    title="Editar salário e VR"
                    onClick={() => setModal({ kind: 'income-sources' })}
                  >
                    <EditIcon />
                  </button>
                </div>
                <span className="fin-flow-value">{formatCurrency(totalAvailable)}</span>

                <div className="fin-mix" role="presentation">
                  {incomeParts
                    .filter((p) => p.value > 0)
                    .map((p) => (
                      <span
                        key={p.key}
                        className={`fin-mix-seg tone-${p.tone}`}
                        style={{ width: `${incomePositive > 0 ? (p.value / incomePositive) * 100 : 0}%` }}
                      />
                    ))}
                </div>

                <ul className="fin-legend">
                  {incomeParts.map((p) => (
                    <li key={p.key}>
                      <span className={`fin-legend-dot tone-${p.tone}${p.value < 0 ? ' is-neg' : ''}`} />
                      <span className="fin-legend-name">{p.label}</span>
                      <span className={`fin-legend-value${p.value < 0 ? ' neg' : ''}`}>
                        {formatCurrency(p.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <span className="fin-flow-op" aria-hidden="true">−</span>

              <div className="fin-flow-step">
                <div className="fin-flow-head">
                  <span className="fin-flow-label">Saídas do mês</span>
                  <button
                    className="icon-btn"
                    title="Gerenciar contas fixas"
                    onClick={() => setModal({ kind: 'recurring' })}
                  >
                    <RepeatIcon />
                  </button>
                </div>
                <span className="fin-flow-value neg">{formatCurrency(outflowTotal)}</span>

                <div className="fin-mix" role="presentation">
                  {outflowParts
                    .filter((p) => p.value > 0)
                    .map((p) => (
                      <span
                        key={p.key}
                        className={`fin-mix-seg tone-${p.tone}`}
                        style={{ width: `${outflowTotal > 0 ? (p.value / outflowTotal) * 100 : 0}%` }}
                      />
                    ))}
                </div>

                <ul className="fin-legend">
                  {outflowParts.map((p) => (
                    <li key={p.key}>
                      <span className={`fin-legend-dot tone-${p.tone}`} />
                      <span className="fin-legend-name">{p.label}</span>
                      <span className="fin-legend-value">{formatCurrency(p.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <span className="fin-flow-op" aria-hidden="true">=</span>

              <div className="fin-flow-step fin-flow-step--result">
                <span className="fin-flow-label">Livre para gastar</span>
                <span className={`fin-flow-value fin-flow-result ${freeToSpend < 0 ? 'neg' : 'pos'}`}>
                  {formatCurrency(freeToSpend)}
                </span>
                <span className="fin-flow-status">{STATUS_MESSAGE[summary.status]}</span>
                <ProgressBar percent={summary.percentUsed} status={summary.status} />
                <div className="fin-flow-actions">
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => setModal({ kind: 'create' })}
                  >
                    + Gasto
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setModal({ kind: 'income', defaultAccountId: walletAccountId })}
                  >
                    + Receita Pix
                  </button>
                </div>
              </div>
            </motion.section>

            {/* ================= FAIXA 2 — detalhe =================
                Esquerda: a lista de contas fixas, que era o dado nº1 do Rafael e
                só existia dentro de um modal. Direita: as três carteiras, porque
                salário, VR e Pix se gastam em lugares diferentes. */}
            <div className="fin-cols">
              <motion.section className="card fin-fixed" variants={overviewItem}>
                <div className="fin-card-head">
                  <h3 className="section-title">Contas fixas do mês</h3>
                  <div className="fin-card-head-actions">
                    {pendingCount > 0 && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={handlePullRecurring}
                        disabled={pulling}
                        title="Lança neste mês as fixas que ainda não entraram"
                      >
                        {pulling ? 'Puxando…' : `Puxar ${pendingCount} do mês passado`}
                      </button>
                    )}
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setModal({ kind: 'recurring' })}
                    >
                      Gerenciar
                    </button>
                  </div>
                </div>

                {activeRecurring.length === 0 ? (
                  <p className="empty">
                    Nenhuma conta fixa cadastrada. Em “Gerenciar” você cadastra academia,
                    seguro, assinaturas — e elas passam a entrar sozinhas todo mês.
                  </p>
                ) : (
                  <>
                    <ul className="fin-fixed-list">
                      {activeRecurring
                        .slice()
                        .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
                        .map((r) => {
                          const launched = launchedTemplateIds.has(r.id);
                          const cat = r.categoryId ? categoryById.get(r.categoryId) : undefined;
                          return (
                            <li key={r.id} className="fin-fixed-row">
                              <span
                                className="cat-dot"
                                style={{ background: cat?.color ?? NEUTRAL_COLOR }}
                              />
                              <span className="fin-fixed-name">{r.description}</span>
                              <span className="fin-fixed-day">dia {r.dayOfMonth}</span>
                              <span
                                className={`fin-fixed-tag${launched ? ' launched' : ''}`}
                                title={launched ? 'Já lançada neste mês' : 'Ainda não lançada'}
                              >
                                {launched ? 'lançada' : 'a lançar'}
                              </span>
                              <span className="fin-fixed-value">{formatCurrency(r.amount)}</span>
                            </li>
                          );
                        })}
                    </ul>
                    <div className="fin-fixed-total">
                      <span>Total por mês</span>
                      <span>{formatCurrency(fixedTotal)}</span>
                    </div>
                  </>
                )}
              </motion.section>

              <motion.section className="card fin-wallets" variants={overviewItem}>
                <h3 className="section-title">Onde o dinheiro está</h3>
                <ul className="fin-wallet-list">
                  <li className="fin-wallet">
                    <div className="fin-wallet-head">
                      <span className="fin-wallet-name">Salário</span>
                      <span className="fin-wallet-value">{formatCurrency(salaryRemaining)}</span>
                    </div>
                    <div className="fin-wallet-bar">
                      <div
                        className="fin-wallet-fill"
                        style={{
                          width: `${summary.income.salary > 0 ? Math.min(100, ((summary.accounts.fixed + summary.accounts.variable) / summary.income.salary) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="fin-wallet-meta">
                      Fatura do cartão {formatCurrency(summary.accounts.fixed + summary.accounts.variable)} de{' '}
                      {formatCurrency(summary.income.salary)}
                    </span>
                  </li>

                  <li className="fin-wallet">
                    <div className="fin-wallet-head">
                      <span className="fin-wallet-name">Vale (VR)</span>
                      <span className="fin-wallet-value">{formatCurrency(voucherRemaining)}</span>
                    </div>
                    <div className="fin-wallet-bar">
                      <div
                        className="fin-wallet-fill vr"
                        style={{
                          width: `${summary.income.voucher > 0 ? Math.min(100, (summary.accounts.foodVoucher / summary.income.voucher) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="fin-wallet-meta">
                      Usado {formatCurrency(summary.accounts.foodVoucher)} de{' '}
                      {formatCurrency(summary.income.voucher)}
                    </span>
                  </li>

                  <li className="fin-wallet">
                    <div className="fin-wallet-head">
                      <span className="fin-wallet-name">Carteira (Pix)</span>
                      <span className="fin-wallet-value">{formatCurrency(summary.walletBalance)}</span>
                    </div>
                    <span className="fin-wallet-meta">
                      Saiu {formatCurrency(summary.accounts.wallet)} este mês
                    </span>
                    <button
                      className="btn-ghost btn-sm fin-wallet-btn"
                      onClick={() => setModal({ kind: 'income', defaultAccountId: walletAccountId })}
                    >
                      + Lançar venda no Pix
                    </button>
                  </li>
                </ul>

                {/* Investimentos não está na navegação principal — este é o
                    caminho para lá, no card das carteiras porque é onde a
                    pergunta "onde está meu dinheiro" naturalmente termina. */}
                <button className="fin-invest-link" onClick={() => navigate('/investimentos')}>
                  <span>Investimentos</span>
                  <span aria-hidden="true">→</span>
                </button>
              </motion.section>

              {summary.byCategory.length > 0 && (
                <motion.section className="card" variants={overviewItem}>
                  <h3 className="section-title">Gasto por categoria</h3>
                  <ul className="cat-list">
                    {summary.byCategory.slice(0, 5).map((c) => {
                      const pct = summary.totalSpent > 0 ? (c.spent / summary.totalSpent) * 100 : 0;
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
            </div>
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
