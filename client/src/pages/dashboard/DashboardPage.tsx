import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { BrandIcon } from '../../components/BrandIcon';
import type {
  Account,
  AgendaEvent,
  Category,
  Expense,
  Income,
  IncomeInput,
  StudiesOverview,
  Summary,
  WaterDay,
} from '../../api/types';
import { useMonth } from '../../context/MonthContext';
import { useDataChanged } from '../../lib/dataEvents';
import {
  formatCurrency,
  formatDayMonth,
  lastMonths,
  monthShort,
  todayIso,
} from '../../utils/format';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  WEEKDAYS_SHORT,
  classesForIso,
  daysUntil,
  todayIsoStr,
} from '../../lib/studies';
import { IncomeFormModal } from '../../components/IncomeFormModal';
import { Delta, Kpi } from '../../components/Kpi';
import { Ring } from '../../components/Ring';
import { useQuickActions } from '../../components/QuickActions';
import {
  ArrowInIcon,
  ArrowOutIcon,
  CardIcon,
  EyeIcon,
  EyeOffIcon,
  MinusIcon,
  PlusIcon,
  TrendUpIcon,
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

interface MonthBar {
  year: number;
  month: number;
  spent: number;
  budget: number;
}

interface DashboardData {
  summary: Summary | null;
  expenses: Expense[];
  incomes: Income[];
  categories: Category[];
  accounts: Account[];
  waterDay: WaterDay | null;
  studies: StudiesOverview | null;
  agendaEvents: AgendaEvent[];
  months: MonthBar[];
}

/**
 * Gasto dos últimos 6 meses ("Profit and Loss" do print): barra escura é o
 * gasto, a hachurada verde é o que sobrou da meta de gasto do mês (quando há
 * meta definida em Ajustes). O mês aberto fica em laranja.
 */
function MonthBars({ months, year, month, mask }: { months: MonthBar[]; year: number; month: number; mask: (v: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => Math.max(m.spent, m.budget)));
  const anyBudget = months.some((m) => m.budget > 0);
  return (
    <section className="ms-card span-4">
      <div className="ms-card-head ms-card-head-plain">
        <div>
          <h3 className="ms-card-title">Gastos por mês</h3>
          <span className="ms-muted">Os últimos seis meses.</span>
        </div>
        <div className="ms-card-actions ms-chart-legend">
          <span>
            <i style={{ background: 'var(--chart-2)' }} />
            Gasto
          </span>
          {anyBudget && (
            <span>
              <i style={{ background: 'var(--feature)' }} />
              Sobra da meta
            </span>
          )}
        </div>
      </div>
      <div className="ms-card-body">
        <div className="ms-mbars" onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => {
            const current = m.year === year && m.month === month;
            const left = m.budget > m.spent ? m.budget - m.spent : 0;
            return (
              <div key={`${m.year}-${m.month}`} className="ms-mbars-col" onMouseEnter={() => setHover(i)}>
                {hover === i && <span className="ms-mbars-tip">{mask(formatCurrency(m.spent))}</span>}
                <div className="ms-mbars-stack">
                  {left > 0 && <div className="ms-mbars-left" style={{ height: `${(left / max) * 100}%` }} />}
                  <div
                    className={`ms-mbars-spent${current ? ' current' : ''}`}
                    style={{ height: `${(m.spent / max) * 100}%` }}
                  />
                </div>
                <span className="ms-mbars-month">{monthShort(m.month)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { year, month } = useMonth();
  const navigate = useNavigate();
  const { newExpense } = useQuickActions();
  const [data, setData] = useState<DashboardData>({
    summary: null,
    expenses: [],
    incomes: [],
    categories: [],
    accounts: [],
    waterDay: null,
    studies: null,
    agendaEvents: [],
    months: [],
  });
  const [loading, setLoading] = useState(true);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [addingWater, setAddingWater] = useState(false);
  const [hideValues, setHideValues] = useState(
    () => localStorage.getItem('hideFinValues') === '1',
  );

  const load = useCallback(async () => {
    const wanted = lastMonths(year, month, 6);
    const years = Array.from(new Set(wanted.map((w) => w.year)));
    const [summary, expenses, incomes, categories, accounts, waterDay, studies, agendaEvents, reports] =
      await Promise.all([
        api.getSummary(year, month).catch(() => null),
        api.listExpenses(year, month).catch((): Expense[] => []),
        api.listIncome(year, month).catch((): Income[] => []),
        api.listCategories().catch((): Category[] => []),
        api.listAccounts().catch((): Account[] => []),
        api.getWaterDay(todayIso()).catch(() => null),
        api.getStudiesOverview().catch(() => null),
        api.listAgendaEvents().catch((): AgendaEvent[] => []),
        Promise.all(years.map((y) => api.getMonthlyReport(y).catch(() => null))),
      ]);
    const byKey = new Map<string, { spent: number; budget: number }>();
    for (const r of reports) {
      if (!r) continue;
      for (const m of r.months) byKey.set(`${r.year}-${m.month}`, { spent: m.spent, budget: m.budget });
    }
    const months = wanted.map((w) => ({ ...w, ...(byKey.get(`${w.year}-${w.month}`) ?? { spent: 0, budget: 0 }) }));
    setData({ summary, expenses, incomes, categories, accounts, waterDay, studies, agendaEvents, months });
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Gasto lançado pelo "+" do dock ou pelo assistente.
  useDataChanged(() => void load());

  async function handleCreateIncome(input: IncomeInput) {
    await api.createIncome(input);
    setIncomeOpen(false);
    await load();
  }

  async function handleAddWater(ml: number) {
    setAddingWater(true);
    try {
      await api.addWaterEntry(ml, todayIso());
      await load();
    } finally {
      setAddingWater(false);
    }
  }

  function toggleHideValues() {
    setHideValues((v) => {
      const next = !v;
      localStorage.setItem('hideFinValues', next ? '1' : '0');
      return next;
    });
  }
  const mask = (value: string) => (hideValues ? '••••' : value);

  const { summary, expenses, incomes, categories, accounts, waterDay, studies, agendaEvents, months } =
    data;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const recentEntries = [
    ...expenses.map((e) => ({ ...e, kind: 'expense' as const })),
    ...incomes.map((i) => ({ ...i, kind: 'income' as const, categoryId: null as string | null })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

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

  const fixed = summary?.accounts.fixed ?? 0;
  const variable = summary?.accounts.variable ?? 0;
  const invoice = fixed + variable;
  const fixedPct = invoice > 0 ? (fixed / invoice) * 100 : 0;
  const salaryLeft = (summary?.income.salary ?? 0) - fixed - variable;
  const voucherLeft = (summary?.income.voucher ?? 0) - (summary?.accounts.foodVoucher ?? 0);
  const wallet = summary?.walletBalance ?? 0;
  const available = (summary?.income.total ?? 0) + wallet;
  const spentNoWallet = available - (summary?.remaining ?? 0);
  const usedPct = Math.round((summary?.percentUsed ?? 0) * 100);

  const current = months.find((m) => m.year === year && m.month === month);
  const previous = months[months.indexOf(current as MonthBar) - 1];
  const spentDelta =
    current && previous && previous.spent > 0 ? ((current.spent - previous.spent) / previous.spent) * 100 : null;

  if (loading) {
    return (
      <div className="center-pad">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="ms-grid12">
      {/* ================= Saldo (Total Balance) ================= */}
      <section className={`ms-card ms-balance span-4 status-${summary?.status ?? 'ok'}`}>
        <div className="ms-balance-top">
          <span className="ms-kpi-label">Ainda posso gastar</span>
          <button
            className="ms-icon-btn"
            title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
            onClick={toggleHideValues}
          >
            {hideValues ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <span className="ms-balance-value">{mask(formatCurrency(summary?.remaining ?? 0))}</span>
        <div className="ms-delta-line">
          <span
            className={`ms-delta ${
              summary?.status === 'over'
                ? 'ms-delta-bad'
                : summary?.status === 'warning'
                  ? 'ms-delta-warn'
                  : 'ms-delta-good'
            }`}
          >
            {usedPct}% usado
          </span>
          <span>de {mask(formatCurrency(available))} disponíveis</span>
        </div>
        <div className="ms-balance-actions">
          <button className="ms-btn ms-btn-ink ms-btn-lg" onClick={newExpense}>
            <MinusIcon />
            Gasto
          </button>
          <button className="ms-btn ms-btn-lg" onClick={() => setIncomeOpen(true)}>
            <PlusIcon />
            Receita
          </button>
        </div>
        <div className="ms-wallets">
          <div className="ms-wallets-head">
            <b>Contas</b> · o que sobra em cada uma
          </div>
          <div className="ms-wallet-grid">
            {[
              { name: 'Salário', value: salaryLeft, hint: 'restante' },
              { name: 'VR', value: voucherLeft, hint: 'restante' },
              { name: 'Carteira', value: wallet, hint: 'saldo' },
            ].map((w) => (
              <div key={w.name} className="ms-wallet">
                <span className="ms-wallet-name">{w.name}</span>
                <span className="ms-wallet-value">{mask(formatCurrency(w.value))}</span>
                <span className={`ms-wallet-hint${w.value < 0 ? ' neg' : ''}`}>
                  {w.value < 0 ? 'no vermelho' : w.hint}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Quatro números ================= */}
      <section className="ms-card ms-quad span-4">
        <Kpi
          bare
          feature
          label="Entra"
          value={mask(formatCurrency(available))}
          icon={ArrowInIcon}
          foot={<span>renda do mês</span>}
        />
        <Kpi
          bare
          label="Sai"
          value={mask(formatCurrency(summary?.totalSpent ?? 0))}
          icon={ArrowOutIcon}
          tone="bad"
          foot={
            <>
              <Delta pct={spentDelta} goodWhenUp={false} />
              <span>{spentDelta !== null ? 'vs mês passado' : 'gastos'}</span>
            </>
          }
        />
        <Kpi
          bare
          label="Fatura"
          value={mask(formatCurrency(invoice))}
          icon={CardIcon}
          tone="accent"
          foot={<span>fixos + variáveis</span>}
        />
        <Kpi
          bare
          label="Sobra do mês"
          value={mask(formatCurrency(summary?.monthSurplus ?? 0))}
          icon={TrendUpIcon}
          tone={(summary?.monthSurplus ?? 0) < 0 ? 'bad' : 'good'}
          foot={<span>renda − gastos</span>}
        />
      </section>

      {/* ================= Gastos por mês ================= */}
      <MonthBars months={months} year={year} month={month} mask={mask} />

      {/* ================= Coluna: limite, fatura, água ================= */}
      <div className="span-4 ms-stack">
        <section className="ms-card">
          <div className="ms-card-head ms-card-head-plain">
            <h3 className="ms-card-title">Limite do mês</h3>
          </div>
          <div className="ms-card-body">
            <div className="ms-limit-track">
              <span
                className={`ms-limit-fill${usedPct >= 100 ? ' over' : ''}`}
                style={{ width: `${Math.min(100, usedPct)}%` }}
              />
            </div>
            <div className="ms-delta-line" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <span>
                <b>{mask(formatCurrency(spentNoWallet))}</b> gastos
              </span>
              <span>
                de <b>{mask(formatCurrency(available))}</b>
              </span>
            </div>
          </div>
        </section>

        <section className="ms-card">
          <div className="ms-card-head ms-card-head-plain">
            <h3 className="ms-card-title">Cartão</h3>
            <div className="ms-card-actions">
              <span className="ms-invoice-total">{mask(formatCurrency(invoice))}</span>
            </div>
          </div>
          <div className="ms-card-body">
            <div className="ms-invoice-bar">
              <span className="ms-invoice-fixed" style={{ width: `${fixedPct}%` }} />
              <span
                className="ms-invoice-variable"
                style={{ width: `${invoice > 0 ? 100 - fixedPct : 0}%` }}
              />
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
          </div>
        </section>

        <section className="ms-card ms-water-card">
          <Ring value={waterDay?.percent ?? 0} size={92} stroke={9}>
            <span className="ms-ring-value">{waterDay?.percent ?? 0}%</span>
            <span className="ms-ring-caption">da meta</span>
          </Ring>
          <div className="ms-water-info">
            <h3 className="ms-card-title">Água hoje</h3>
            <span className="ms-muted">
              {formatMl(waterDay?.consumedMl ?? 0)} de {formatMl(waterDay?.goalMl ?? 3000)}
            </span>
            <button
              className="ms-btn"
              disabled={addingWater}
              onClick={() => void handleAddWater(WATER_QUICK_ADD.ml)}
              title={`Adicionar garrafa (${WATER_QUICK_ADD.ml} ml)`}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              <PlusIcon />
              {WATER_QUICK_ADD.label}
            </button>
          </div>
        </section>
      </div>

      {/* ================= Atividade recente ================= */}
      <section className="ms-card span-8">
        <div className="ms-card-head ms-card-head-plain">
          <h3 className="ms-card-title">Últimos lançamentos</h3>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/financas/lancamentos">
              Ver todos
            </Link>
          </div>
        </div>
        <div className="ms-card-body" style={{ paddingTop: 8 }}>
          {recentEntries.length === 0 ? (
            <p className="empty">Nenhum lançamento este mês.</p>
          ) : (
            <table className="ms-table">
              <thead>
                <tr>
                  <th>Lançamento</th>
                  <th className="hide-sm">Categoria</th>
                  <th className="hide-sm">Conta</th>
                  <th className="num">Valor</th>
                  <th className="hide-sm">Tipo</th>
                  <th className="num">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((entry) => {
                  const cat = entry.categoryId ? categoryById.get(entry.categoryId) : undefined;
                  const account = accounts.find((a) => a.id === entry.accountId);
                  const isIncome = entry.kind === 'income';
                  return (
                    <tr key={`${entry.kind}-${entry.id}`}>
                      <td>
                        <span className="ms-table-name">
                          <BrandIcon
                            description={entry.description}
                            fallbackColor={isIncome ? 'var(--ok)' : cat?.color}
                            size={26}
                          />
                          <span>{entry.description}</span>
                        </span>
                      </td>
                      <td className="ms-table-muted hide-sm">{isIncome ? 'Receita' : (cat?.name ?? 'Sem categoria')}</td>
                      <td className="ms-table-muted hide-sm">{account?.name ?? '—'}</td>
                      <td className={`num ${isIncome ? 'ms-pos' : ''}`}>
                        {hideValues ? '••••' : `${isIncome ? '+' : '−'}${formatCurrency(entry.amount)}`}
                      </td>
                      <td className="hide-sm">
                        <span className={`ms-status ${isIncome ? 'ms-status-in' : 'ms-status-out'}`}>
                          {isIncome ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="num ms-table-muted">{formatDayMonth(entry.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ================= O dia (sem equivalente no print) ================= */}
      <section className="ms-card span-3 ms-day-cards">
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
          <p className="empty">Sem aulas hoje.</p>
        ) : (
          todayClasses.map((c) => {
            const [startStr, endStr] = c.time.split('–');
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);
            const ongoing = nowMinutes >= sh * 60 + sm && nowMinutes < eh * 60 + em;
            const done = nowMinutes >= eh * 60 + em;
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

      <section className="ms-card span-3 ms-day-cards">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Agenda</h3>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/agenda">
              Abrir
            </Link>
          </div>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="empty">Nenhum evento nos próximos 30 dias.</p>
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

      <section className="ms-card span-3 ms-day-cards">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Próximas provas</h3>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/estudos/provas">
              Abrir
            </Link>
          </div>
        </div>
        {upcomingExams.length === 0 ? (
          <p className="empty">Nenhuma prova agendada.</p>
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

      <section className="ms-card span-3 ms-day-cards">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Tarefas pendentes</h3>
          <span className="ms-muted">{studies?.totals.pendingTaskCount ?? 0}</span>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/estudos/tarefas">
              Abrir
            </Link>
          </div>
        </div>
        {pendingTasks.length === 0 ? (
          <p className="empty">Nenhuma tarefa pendente.</p>
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

      {incomeOpen && (
        <IncomeFormModal
          title="Nova receita"
          accounts={accounts}
          onCancel={() => setIncomeOpen(false)}
          onSubmit={handleCreateIncome}
        />
      )}
    </div>
  );
}
