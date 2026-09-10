import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandIcon } from '../../components/BrandIcon';
import type { ChatPreview, ExpenseInput, IncomeInput } from '../../api/types';
import {
  useAccounts,
  useAddWaterEntry,
  useAfterFinanceChange,
  useAgendaEvents,
  useCategories,
  useCreateExpense,
  useCreateIncome,
  useExpenses,
  useIncomes,
  useStudiesOverview,
  useSummary,
  useWaterDay,
} from '../../api/queries';
import { formatCurrency, formatDayMonth, todayIso } from '../../utils/format';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  WEEKDAYS_SHORT,
  classesForIso,
  daysUntil,
  todayIsoStr,
} from '../../lib/studies';
import { ChatBox } from '../../components/ChatBox';
import { EmptyState } from '../../components/EmptyState';
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonLine,
  SkeletonRows,
} from '../../components/Skeleton';
import { ExpenseFormModal } from '../../components/ExpenseFormModal';
import { IncomeFormModal } from '../../components/IncomeFormModal';
import {
  BookIcon,
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  MinusIcon,
  PlusIcon,
  WalletIcon,
} from '../../components/icons';

function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1).replace('.', ',')} L`;
  return `${ml} ml`;
}

/** "faltam N dias" curto, para os chips de contagem. */
function shortCountdown(days: number): string {
  if (days < 0) return `${Math.abs(days)}d atraso`;
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `${days}d`;
}

const WATER_QUICK_ADD = { label: 'Garrafa', ml: 600 };

type FinModal = 'closed' | 'expense' | 'income';

/** Lote de lançamentos extraídos de uma foto/PDF pelo assistente. */
interface BatchState {
  previews: ChatPreview[];
  index: number;
}

/**
 * Falha de um card, no lugar do conteúdo dele. Antes cada requisição tinha um
 * `.catch(() => null)` e a falha aparecia como card vazio — indistinguível de
 * "não há nada aqui". Um card que falhou não derruba os outros.
 */
function CardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="alert alert-error">
      Não foi possível carregar.{' '}
      <button className="ms-btn ms-btn-ghost" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Saldo de uma fonte de dinheiro (salário, VR, carteira). */
function SourceTile({
  label,
  value,
  hint,
  negative,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="ms-card ms-source">
      <span className="ms-label">{label}</span>
      {loading ? (
        // 20px é o font-size de .ms-source-value: o número nasce exatamente
        // onde o skeleton está, sem empurrar o card.
        <SkeletonLine width="80%" height="20px" />
      ) : (
        <span className="ms-source-value" style={negative ? { color: 'var(--over)' } : undefined}>
          {value}
        </span>
      )}
      {hint && <span className="ms-muted">{hint}</span>}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  // Uma query por recurso, cada uma com seu próprio loading e erro. O mês vem
  // do MonthContext dentro dos hooks (ver api/queries.ts).
  const summaryQuery = useSummary();
  const expensesQuery = useExpenses();
  const incomesQuery = useIncomes();
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const waterQuery = useWaterDay(todayIso());
  const studiesQuery = useStudiesOverview();
  const agendaQuery = useAgendaEvents();

  const createExpense = useCreateExpense();
  const createIncome = useCreateIncome();
  const addWaterEntry = useAddWaterEntry();
  const afterFinanceChange = useAfterFinanceChange();

  const [finModal, setFinModal] = useState<FinModal>('closed');
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [hideValues, setHideValues] = useState(
    () => localStorage.getItem('hideFinValues') === '1',
  );

  async function handleCreateExpense(input: ExpenseInput) {
    await createExpense.mutateAsync(input);
    setFinModal('closed');
  }
  async function handleCreateIncome(input: IncomeInput) {
    await createIncome.mutateAsync(input);
    setFinModal('closed');
  }

  // Confirmação em lote (vários lançamentos extraídos de um arquivo no chat),
  // mesmo fluxo da aba Finanças: revisa um a um ou aceita todos de uma vez.
  async function handleBatchSubmit(input: ExpenseInput) {
    await createExpense.mutateAsync(input);
    advanceBatch();
  }
  function advanceBatch() {
    setBatch((prev) => {
      if (!prev) return null;
      const nextIndex = prev.index + 1;
      return nextIndex >= prev.previews.length
        ? null
        : { previews: prev.previews, index: nextIndex };
    });
  }
  async function handleAcceptAllBatch() {
    if (!batch) return;
    const defaultAccountId = accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? null;
    for (const preview of batch.previews.slice(batch.index)) {
      await createExpense.mutateAsync({
        description: preview.description,
        amount: preview.amount,
        date: preview.date,
        categoryId: preview.categoryId,
        accountId: defaultAccountId,
        recurring: preview.recurring,
      });
    }
    setBatch(null);
  }
  async function handleAddWater(ml: number) {
    await addWaterEntry.mutateAsync({ ml, date: todayIso() });
  }

  function toggleHideValues() {
    setHideValues((v) => {
      const next = !v;
      localStorage.setItem('hideFinValues', next ? '1' : '0');
      return next;
    });
  }
  const mask = (value: string) => (hideValues ? '••••' : value);

  const summary = summaryQuery.data;
  const expenses = expensesQuery.data ?? [];
  const incomes = incomesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const waterDay = waterQuery.data;
  const studies = studiesQuery.data;
  const agendaEvents = agendaQuery.data ?? [];

  type Entry = {
    id: string;
    description: string;
    amount: number;
    date: string;
    kind: 'expense' | 'income';
  };
  const recentEntries: Entry[] = [
    ...expenses.map((e) => ({ ...e, kind: 'expense' as const })),
    ...incomes.map((i) => ({ ...i, kind: 'income' as const })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      description: e.description,
      amount: e.amount,
      date: e.date,
      kind: e.kind,
    }));

  const subjects = studies?.subjects ?? [];
  const subjectById = (id: string | null) => subjects.find((s) => s.id === id);

  const upcomingExams = (studies?.upcomingExams ?? [])
    .map((e) => ({ ...e, daysLeft: daysUntil(e.date) }))
    .filter((e) => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 4);

  const upcomingEvents = agendaEvents
    .map((ev) => ({ ...ev, daysLeft: daysUntil(ev.date) }))
    .filter((ev) => ev.daysLeft >= 0 && ev.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft || (a.time ?? '').localeCompare(b.time ?? ''))
    .slice(0, 5);

  const pendingTasks = (studies?.pendingTasks ?? [])
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 5);

  const today = todayIsoStr();
  const todayClasses = classesForIso(today);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const status = summary?.status ?? 'ok';
  const fixed = summary?.accounts.fixed ?? 0;
  const variable = summary?.accounts.variable ?? 0;
  const invoice = fixed + variable;
  const fixedPct = invoice > 0 ? (fixed / invoice) * 100 : 0;
  const salaryLeft = (summary?.income.salary ?? 0) - fixed - variable;
  const voucherLeft = (summary?.income.voucher ?? 0) - (summary?.accounts.foodVoucher ?? 0);
  const wallet = summary?.walletBalance ?? 0;

  // Nenhum spinner de tela cheia: cada card mostra o próprio skeleton, no
  // lugar exato onde o conteúdo vai nascer (ver components/Skeleton.tsx). Na
  // TROCA de mês nem isso aparece — as queries devolvem o mês anterior como
  // placeholder (keepPreviousData) e o estado já é 'success'.
  const entriesLoading = expensesQuery.isPending || incomesQuery.isPending;

  return (
    <div className="ms-dash">
      {/* ================= Coluna do dinheiro ================= */}
      <div className="ms-stack ms-dash-money">
        <section className={`ms-card ms-hero status-${status}`}>
          <div className="ms-hero-top">
            <span className="ms-label">Ainda posso gastar</span>
            <button
              className="ms-icon-btn"
              title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              onClick={toggleHideValues}
            >
              {hideValues ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {summaryQuery.isError ? (
            <CardError onRetry={() => void summaryQuery.refetch()} />
          ) : summaryQuery.isPending ? (
            <div className="ms-hero-skeleton">
              {/* 40px e 13px são os font-sizes de .ms-hero-value e
                  .ms-hero-status — mesma altura do que vai aparecer. */}
              <SkeletonLine width="58%" height="40px" />
              <SkeletonLine width="76%" height="13px" />
            </div>
          ) : (
            <>
              <span className="ms-hero-value">{mask(formatCurrency(summary?.remaining ?? 0))}</span>
              <span className="ms-hero-status">
                Renda {mask(formatCurrency(summary?.income.total ?? 0))} · Gastos{' '}
                {mask(formatCurrency(summary?.totalSpent ?? 0))}
              </span>
            </>
          )}
          <div className="ms-quick-actions">
            <button className="ms-quick ms-quick-expense" onClick={() => setFinModal('expense')}>
              <MinusIcon />
              Gasto
            </button>
            <button className="ms-quick ms-quick-income" onClick={() => setFinModal('income')}>
              <PlusIcon />
              Receita
            </button>
          </div>
        </section>

        {!summaryQuery.isError && (
          <div className="ms-sources">
            <SourceTile
              label="Salário"
              value={mask(formatCurrency(salaryLeft))}
              hint="restante"
              negative={salaryLeft < 0}
              loading={summaryQuery.isPending}
            />
            <SourceTile
              label="VR"
              value={mask(formatCurrency(voucherLeft))}
              hint="restante"
              negative={voucherLeft < 0}
              loading={summaryQuery.isPending}
            />
            <SourceTile
              label="Carteira"
              value={mask(formatCurrency(wallet))}
              hint="saldo"
              negative={wallet < 0}
              loading={summaryQuery.isPending}
            />
          </div>
        )}

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Fatura estimada</h3>
            <div className="ms-card-actions">
              {summaryQuery.isPending ? (
                <SkeletonLine width="84px" height="15px" />
              ) : (
                <span className="ms-invoice-total">{mask(formatCurrency(invoice))}</span>
              )}
            </div>
          </div>
          <div className="ms-card-body">
            {summaryQuery.isError ? (
              <CardError onRetry={() => void summaryQuery.refetch()} />
            ) : summaryQuery.isPending ? (
              <>
                {/* 10px é a altura da .ms-invoice-bar. */}
                <SkeletonBlock height="10px" className="ms-invoice-bar-skeleton" />
                <div className="ms-invoice-legend">
                  <SkeletonLine width="104px" height="12px" />
                  <SkeletonLine width="116px" height="12px" />
                </div>
              </>
            ) : (
              <>
                <div className="ms-invoice-bar">
                  <span className="ms-invoice-fixed" style={{ width: `${fixedPct}%` }} />
                  <span className="ms-invoice-variable" style={{ width: `${100 - fixedPct}%` }} />
                </div>
                <div className="ms-invoice-legend">
                  <span>
                    <i className="ms-dot ms-dot-fixed" />
                    Fixos <b>{mask(formatCurrency(fixed))}</b>
                  </span>
                  <span>
                    <i className="ms-dot ms-dot-variable" />
                    Variáveis <b>{mask(formatCurrency(variable))}</b>
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Últimos lançamentos</h3>
            <div className="ms-card-actions">
              <Link className="ms-btn ms-btn-ghost" to="/financas/lancamentos">
                Ver todos
              </Link>
            </div>
          </div>
          {expensesQuery.isError || incomesQuery.isError ? (
            <CardError
              onRetry={() => {
                void expensesQuery.refetch();
                void incomesQuery.refetch();
              }}
            />
          ) : entriesLoading ? (
            <SkeletonRows count={3} />
          ) : recentEntries.length === 0 ? (
            <EmptyState
              compact
              icon={<WalletIcon />}
              title="Nenhum lançamento este mês"
              action={{ label: 'Lançar gasto', onClick: () => setFinModal('expense') }}
            />
          ) : (
            recentEntries.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className="ms-row ms-row-tight">
                <BrandIcon
                  description={entry.description}
                  fallbackColor={entry.kind === 'income' ? 'var(--ok)' : undefined}
                  size={26}
                />
                <span className="ms-row-name">
                  {entry.description}
                  <span className="ms-row-sub">{formatDayMonth(entry.date)}</span>
                </span>
                <span className={`ms-row-amount${entry.kind === 'income' ? ' ms-pos' : ''}`}>
                  {hideValues
                    ? '••••'
                    : `${entry.kind === 'income' ? '+' : '−'}${formatCurrency(entry.amount)}`}
                </span>
              </div>
            ))
          )}
        </section>

      </div>

      {/* ================= Trilha do dia ================= */}
      <div className="ms-stack ms-dash-day">
        <section className="ms-card">
          <div className="ms-card-head">
            <div>
              <h3 className="ms-card-title">Hoje</h3>
              <span className="ms-muted">{WEEKDAYS_SHORT[new Date().getDay()]}</span>
            </div>
            <div className="ms-card-actions">
              <Link className="ms-btn ms-btn-ghost" to="/agenda">
                Agenda
              </Link>
            </div>
          </div>
          {todayClasses.length === 0 ? (
            // Sem ação: dia sem aula não é problema a resolver.
            <EmptyState compact icon={<BookIcon />} title="Sem aulas hoje" />
          ) : (
            todayClasses.map((c) => {
              const [startStr, endStr] = c.time.split('–');
              const [sh, sm] = startStr.split(':').map(Number);
              const [eh, em] = endStr.split(':').map(Number);
              const startMin = sh * 60 + sm;
              const endMin = eh * 60 + em;
              const ongoing = nowMinutes >= startMin && nowMinutes < endMin;
              const done = nowMinutes >= endMin;
              const subj = subjects.find((s) => s.name === c.name);
              return (
                <div key={c.time} className={`ms-row${done ? ' ms-row-muted' : ''}`}>
                  <span className="ms-row-time">{c.time}</span>
                  <span className="ms-row-name">
                    {c.name}
                    {subj && <span className="ms-row-sub">{subj.progress}% concluído</span>}
                  </span>
                  {ongoing && <span className="ms-chip ms-chip-ok">Agora</span>}
                  {done && <span className="ms-chip">Concluída</span>}
                </div>
              );
            })
          )}
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Agenda</h3>
            <div className="ms-card-actions">
              <Link className="ms-btn ms-btn-ghost" to="/agenda">
                Abrir
              </Link>
            </div>
          </div>
          {agendaQuery.isError ? (
            <CardError onRetry={() => void agendaQuery.refetch()} />
          ) : agendaQuery.isPending ? (
            <SkeletonRows count={3} circle={false} />
          ) : upcomingEvents.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarIcon />}
              title="Nada nos próximos 30 dias"
              action={{ label: 'Abrir agenda', to: '/agenda' }}
            />
          ) : (
            upcomingEvents.map((ev) => (
              <div key={ev.id} className="ms-row">
                <span className="ms-row-flag" style={{ background: CATEGORY_COLORS[ev.category] }} />
                <span className="ms-row-name">
                  {ev.title}
                  <span className="ms-row-sub">
                    {CATEGORY_LABELS[ev.category]}
                    {ev.time ? ` · ${ev.time}` : ''}
                  </span>
                </span>
                <span className={`ms-chip${ev.daysLeft <= 1 ? ' ms-chip-danger' : ''}`}>
                  {shortCountdown(ev.daysLeft)}
                </span>
              </div>
            ))
          )}
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Água hoje</h3>
            <div className="ms-card-actions">
              <button
                className="ms-btn ms-btn-primary"
                disabled={addWaterEntry.isPending}
                onClick={() => void handleAddWater(WATER_QUICK_ADD.ml)}
                title={`Adicionar garrafa (${WATER_QUICK_ADD.ml} ml)`}
              >
                + {WATER_QUICK_ADD.label}
              </button>
            </div>
          </div>
          {waterQuery.isError ? (
            <div className="ms-card-body">
              <CardError onRetry={() => void waterQuery.refetch()} />
            </div>
          ) : waterQuery.isPending ? (
            <div className="ms-card-body ms-water">
              {/* 56px é o tamanho do anel. */}
              <SkeletonCircle size={56} />
              <SkeletonLine width="120px" height="15px" />
            </div>
          ) : (
            <div className="ms-card-body ms-water">
              <div className="ms-water-ring">
                <svg viewBox="0 0 56 56" width="56" height="56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="5"
                    strokeDasharray={`${(Math.min(100, waterDay?.percent ?? 0) / 100) * 150.8} 150.8`}
                    strokeLinecap="round"
                    transform="rotate(-90 28 28)"
                  />
                </svg>
                <span className="ms-water-pct">{waterDay?.percent ?? 0}%</span>
              </div>
              <div>
                <span className="ms-value">{formatMl(waterDay?.consumedMl ?? 0)}</span>
                <span className="ms-muted"> / {formatMl(waterDay?.goalMl ?? 3000)}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ================= Estudos ================= */}
      <div className="ms-stack ms-dash-studies">
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Próximas provas</h3>
            <div className="ms-card-actions">
              <Link className="ms-btn ms-btn-ghost" to="/estudos/provas">
                Abrir
              </Link>
            </div>
          </div>
          {studiesQuery.isError ? (
            <CardError onRetry={() => void studiesQuery.refetch()} />
          ) : studiesQuery.isPending ? (
            <SkeletonRows count={3} circle={false} />
          ) : upcomingExams.length === 0 ? (
            <EmptyState
              compact
              icon={<BookIcon />}
              title="Nenhuma prova agendada"
              action={{ label: 'Marcar prova', to: '/estudos/provas' }}
            />
          ) : (
            upcomingExams.map((exam) => {
              const subj = subjectById(exam.subjectId);
              return (
                <div key={exam.id} className="ms-row" onClick={() => navigate('/estudos/provas')}>
                  <span className="ms-row-name">
                    {exam.title}
                    <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                  </span>
                  <span className={`ms-chip${exam.daysLeft <= 3 ? ' ms-chip-danger' : ''}`}>
                    {shortCountdown(exam.daysLeft)}
                  </span>
                </div>
              );
            })
          )}
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Tarefas pendentes</h3>
            <span className="ms-muted">{studies?.totals.pendingTaskCount ?? 0}</span>
            <div className="ms-card-actions">
              <Link className="ms-btn ms-btn-ghost" to="/estudos/tarefas">
                Abrir
              </Link>
            </div>
          </div>
          {studiesQuery.isError ? (
            <CardError onRetry={() => void studiesQuery.refetch()} />
          ) : studiesQuery.isPending ? (
            <SkeletonRows count={3} circle={false} />
          ) : pendingTasks.length === 0 ? (
            <EmptyState compact icon={<CheckIcon />} title="Tudo em dia" />
          ) : (
            pendingTasks.map((task) => {
              const days = task.dueDate ? daysUntil(task.dueDate) : null;
              const subj = subjectById(task.subjectId);
              return (
                <div key={task.id} className="ms-row">
                  <span className="ms-row-name">
                    {task.title}
                    <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                  </span>
                  {days !== null && (
                    <span className={`ms-chip${days <= 0 ? ' ms-chip-danger' : ''}`}>
                      {shortCountdown(days)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>

      {finModal === 'expense' && (
        <ExpenseFormModal
          title="Novo gasto"
          categories={categories}
          accounts={accounts}
          onCancel={() => setFinModal('closed')}
          onSubmit={handleCreateExpense}
        />
      )}
      {finModal === 'income' && (
        <IncomeFormModal
          title="Nova receita"
          accounts={accounts}
          onCancel={() => setFinModal('closed')}
          onSubmit={handleCreateIncome}
        />
      )}
      {batch && (
        <ExpenseFormModal
          key={batch.index}
          title="Confirmar lançamento"
          progress={`${batch.index + 1} de ${batch.previews.length}`}
          categories={categories}
          accounts={accounts}
          initial={batch.previews[batch.index]}
          onCancel={() => setBatch(null)}
          onSubmit={handleBatchSubmit}
          onSkip={advanceBatch}
          onAcceptAll={handleAcceptAllBatch}
        />
      )}

      {/* Assistente: lançar por texto/foto ou perguntar sobre os gastos */}
      <ChatBox
        onSaved={afterFinanceChange}
        onPreviews={(previews) => setBatch({ previews, index: 0 })}
      />
    </div>
  );
}
