import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client';
import type {
  Account,
  BodyMetric,
  Category,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  StudiesOverview,
  Summary,
  WaterDay,
  WorkoutSummary,
  WorkoutToday,
} from '../api/types';
import { useMonth } from '../context/MonthContext';
import { formatCurrency, formatDayMonth, todayIso } from '../utils/format';
import { springSmooth } from '../lib/motion';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { IncomeFormModal } from '../components/IncomeFormModal';

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1).replace('.', ',')} L`;
  return `${ml} ml`;
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const WATER_QUICK_ADDS = [
  { label: 'Copo', ml: 200 },
  { label: 'Garrafa', ml: 500 },
];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: springSmooth } };

type FinModal = 'closed' | 'expense' | 'income';

interface HomeData {
  summary: Summary | null;
  expenses: Expense[];
  incomes: Income[];
  categories: Category[];
  accounts: Account[];
  waterDay: WaterDay | null;
  workoutToday: WorkoutToday | null;
  workoutSummary: WorkoutSummary | null;
  bodyMetrics: BodyMetric[];
  studies: StudiesOverview | null;
}

export function HomePage() {
  const { year, month } = useMonth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData>({
    summary: null, expenses: [], incomes: [], categories: [], accounts: [],
    waterDay: null, workoutToday: null, workoutSummary: null,
    bodyMetrics: [], studies: null,
  });
  const [loading, setLoading] = useState(true);
  const [finModal, setFinModal] = useState<FinModal>('closed');
  const [addingWater, setAddingWater] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies] =
      await Promise.all([
        api.getSummary(year, month).catch(() => null),
        api.listExpenses(year, month).catch((): Expense[] => []),
        api.listIncome(year, month).catch((): Income[] => []),
        api.listCategories().catch((): Category[] => []),
        api.listAccounts().catch((): Account[] => []),
        api.getWaterDay(todayIso()).catch(() => null),
        api.getWorkoutToday().catch(() => null),
        api.getWorkoutSummary().catch(() => null),
        api.listBodyMetrics().catch((): BodyMetric[] => []),
        api.getStudiesOverview().catch(() => null),
      ]);
    setData({ summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies });
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateExpense(data: ExpenseInput) {
    await api.createExpense(data);
    setFinModal('closed');
    await load();
  }

  async function handleCreateIncome(data: IncomeInput) {
    await api.createIncome(data);
    setFinModal('closed');
    await load();
  }

  async function handleAddWater(ml: number) {
    setAddingWater(true);
    try {
      await api.addWaterEntry(ml);
      await load();
    } finally {
      setAddingWater(false);
    }
  }

  const { summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies } = data;

  type Entry = { id: string; description: string; amount: number; date: string; kind: 'expense' | 'income' };
  const recentEntries: Entry[] = [
    ...expenses.map((e) => ({ id: e.id, description: e.description, amount: e.amount, date: e.date, kind: 'expense' as const })),
    ...incomes.map((i) => ({ id: i.id, description: i.description, amount: i.amount, date: i.date, kind: 'income' as const })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const latestWeight = bodyMetrics
    .filter((m) => m.weightKg !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg ?? null;

  const topPRs = (workoutSummary?.exercises ?? [])
    .filter((e) => e.pr > 0)
    .sort((a, b) => b.pr - a.pr)
    .slice(0, 3);

  const upcomingExams = (studies?.upcomingExams ?? [])
    .map((e) => ({ ...e, daysLeft: daysUntil(e.date) }))
    .filter((e) => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  const pendingTasks = (studies?.pendingTasks ?? [])
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 4);

  const topSubjects = (studies?.subjects ?? []).slice(0, 4);

  const budgetStatus = summary?.status ?? 'ok';
  const progressColor =
    budgetStatus === 'over' ? 'var(--over)' : budgetStatus === 'warning' ? 'var(--warning)' : 'var(--ok)';
  const remainingColor =
    budgetStatus === 'over' ? 'var(--over)' : budgetStatus === 'warning' ? 'var(--warning)' : 'var(--text)';

  if (loading) {
    return <div className="center-pad"><div className="spinner" /></div>;
  }

  return (
    <>
      <motion.div className="home-page" variants={stagger} initial="hidden" animate="show">

        {/* ===== FINANÇAS ===== */}
        <motion.section className="home-section" variants={fadeUp}>
          <div className="home-section-header">
            <span className="home-section-dot" style={{ background: 'var(--warning)' }} />
            Finanças
          </div>

          <div className="card home-clickable" onClick={() => navigate('/')}>
            <p className="home-label">Ainda posso gastar</p>
            <p className="home-hero-value" style={{ color: remainingColor }}>
              {formatCurrency(summary?.remaining ?? 0)}
            </p>
            <div className="home-progress-bar">
              <div
                className="home-progress-fill"
                style={{ width: `${Math.min(100, summary?.percentUsed ?? 0)}%`, background: progressColor }}
              />
            </div>
            <p className="home-sub">{Math.round(summary?.percentUsed ?? 0)}% do orçamento usado</p>
            <div className="home-hero-actions">
              <button
                className="home-action-btn home-action-expense"
                onClick={(e) => { e.stopPropagation(); setFinModal('expense'); }}
                title="Novo gasto"
              >
                − Gasto
              </button>
              <button
                className="home-action-btn home-action-income"
                onClick={(e) => { e.stopPropagation(); setFinModal('income'); }}
                title="Nova receita"
              >
                + Receita
              </button>
            </div>
          </div>

          <div className="home-grid-2">
            <div className="card">
              <p className="home-label">Renda</p>
              <p className="home-value" style={{ color: 'var(--ok)' }}>{formatCurrency(summary?.income.total ?? 0)}</p>
            </div>
            <div className="card">
              <p className="home-label">Gastos</p>
              <p className="home-value" style={{ color: 'var(--over)' }}>{formatCurrency(summary?.totalSpent ?? 0)}</p>
            </div>
          </div>

          <div className="card">
            <div className="home-accounts">
              <div>
                <p className="home-label">Salário</p>
                <p className="home-account-val" style={{ color: (summary?.income.salary ?? 0) - (summary?.accounts.fixed ?? 0) - (summary?.accounts.variable ?? 0) < 0 ? 'var(--over)' : 'var(--ok)' }}>
                  {formatCurrency((summary?.income.salary ?? 0) - (summary?.accounts.fixed ?? 0) - (summary?.accounts.variable ?? 0))}
                </p>
              </div>
              <div>
                <p className="home-label">VR</p>
                <p className="home-account-val">
                  {formatCurrency((summary?.income.voucher ?? 0) - (summary?.accounts.foodVoucher ?? 0))}
                </p>
              </div>
              <div>
                <p className="home-label">Carteira</p>
                <p className="home-account-val" style={{ color: (summary?.walletBalance ?? 0) < 0 ? 'var(--over)' : undefined }}>
                  {formatCurrency(summary?.walletBalance ?? 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="card home-clickable" onClick={() => navigate('/')}>
            <p className="home-label" style={{ marginBottom: 8 }}>Últimos lançamentos</p>
            {recentEntries.length === 0 ? (
              <p className="home-sub">Nenhum lançamento este mês.</p>
            ) : (
              recentEntries.map((entry) => (
                <div key={`${entry.kind}-${entry.id}`} className="home-list-item">
                  <span className="home-list-left">{entry.description}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                    <span
                      className="home-list-right"
                      style={{ color: entry.kind === 'income' ? 'var(--ok)' : 'var(--text)' }}
                    >
                      {entry.kind === 'income' ? '+' : '−'}{formatCurrency(entry.amount)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatDayMonth(entry.date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.section>

        {/* ===== SAÚDE ===== */}
        <motion.section className="home-section" variants={fadeUp}>
          <div className="home-section-header">
            <span className="home-section-dot" style={{ background: 'var(--ok)' }} />
            Saúde
          </div>

          <div className="card home-clickable" onClick={() => navigate('/saude')}>
            <div className="home-water-row">
              <div className="home-water-ring">
                <svg viewBox="0 0 56 56" width="56" height="56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
                  <circle
                    cx="28" cy="28" r="24"
                    fill="none" stroke="var(--primary)" strokeWidth="5"
                    strokeDasharray={`${(Math.min(100, waterDay?.percent ?? 0) / 100) * 150.8} 150.8`}
                    strokeLinecap="round"
                    transform="rotate(-90 28 28)"
                  />
                </svg>
                <span className="home-water-pct">{waterDay?.percent ?? 0}%</span>
              </div>
              <div>
                <p className="home-label">Água hoje</p>
                <p style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>
                  {formatMl(waterDay?.consumedMl ?? 0)}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {formatMl(waterDay?.goalMl ?? 3000)}</span>
                </p>
              </div>
            </div>
            <div className="home-water-actions">
              {WATER_QUICK_ADDS.map((qa) => (
                <button
                  key={qa.label}
                  className="home-action-btn home-action-water"
                  disabled={addingWater}
                  onClick={(e) => { e.stopPropagation(); handleAddWater(qa.ml); }}
                  title={`Adicionar ${qa.label.toLowerCase()} (${qa.ml} ml)`}
                >
                  + {qa.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card home-clickable" onClick={() => navigate('/saude')}>
            {workoutToday?.day ? (
              <>
                <div className="home-workout-head">
                  <span style={{ fontWeight: 700 }}>
                    {WEEKDAYS_PT[workoutToday.weekday]} — {workoutToday.day.name}
                  </span>
                  {workoutToday.session && <span className="home-tag-done">Feito</span>}
                </div>
                {!workoutToday.session && workoutToday.day.exercises.slice(0, 4).map((ex) => (
                  <div key={ex.id} className="home-list-item">
                    <span className="home-list-left">{ex.name}</span>
                    <span className="home-list-right">
                      {ex.targetSets && ex.targetReps ? `${ex.targetSets}×${ex.targetReps}` : '—'}
                    </span>
                  </div>
                ))}
                {!workoutToday.session && workoutToday.day.exercises.length > 4 && (
                  <p className="home-sub">+{workoutToday.day.exercises.length - 4} exercícios</p>
                )}
              </>
            ) : (
              <>
                <p className="home-label">Treino de hoje</p>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>Dia de descanso</p>
              </>
            )}
          </div>

          <div className="home-grid-2">
            <div className="card">
              <p className="home-label">Semana</p>
              <p className="home-value" style={{ color: 'var(--ok)' }}>{workoutSummary?.thisWeekCount ?? 0}</p>
              <p className="home-sub">treinos feitos</p>
            </div>
            <div className="card">
              <p className="home-label">Peso</p>
              <p className="home-value">
                {latestWeight != null ? `${String(latestWeight).replace('.', ',')} kg` : '—'}
              </p>
              <p className="home-sub">último registro</p>
            </div>
          </div>

          {topPRs.length > 0 && (
            <div className="card home-clickable" onClick={() => navigate('/saude')}>
              <p className="home-label" style={{ marginBottom: 8 }}>PRs</p>
              {topPRs.map((ex) => (
                <div key={ex.name} className="home-list-item">
                  <span className="home-list-left">{ex.name}</span>
                  <span className="home-list-right" style={{ color: 'var(--ok)' }}>{ex.pr} kg</span>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* ===== ESTUDOS ===== */}
        <motion.section className="home-section" variants={fadeUp}>
          <div className="home-section-header">
            <span className="home-section-dot" style={{ background: 'var(--primary)' }} />
            Estudos
          </div>

          <div className="card home-clickable" onClick={() => navigate('/estudos')}>
            <p className="home-label" style={{ marginBottom: 8 }}>Próximas provas</p>
            {upcomingExams.length === 0 ? (
              <p className="home-sub">Nenhuma prova agendada.</p>
            ) : (
              upcomingExams.map((exam) => (
                <div key={exam.id} className="home-list-item">
                  <span className="home-list-left">{exam.title}</span>
                  <span
                    className="home-chip"
                    style={{
                      background: exam.daysLeft <= 3 ? 'var(--over-bg)' : 'var(--info-bg)',
                      color: exam.daysLeft <= 3 ? 'var(--over)' : 'var(--primary)',
                    }}
                  >
                    {exam.daysLeft === 0 ? 'Hoje' : exam.daysLeft === 1 ? 'Amanhã' : `${exam.daysLeft}d`}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card home-clickable" onClick={() => navigate('/estudos')}>
            <div className="home-row-space">
              <p className="home-label">Tarefas pendentes</p>
              {(studies?.totals.pendingTaskCount ?? 0) > 0 && (
                <span style={{ color: 'var(--over)', fontWeight: 700, fontSize: '0.85rem' }}>
                  {studies?.totals.pendingTaskCount}
                </span>
              )}
            </div>
            {pendingTasks.length === 0 ? (
              <p className="home-sub">Nenhuma tarefa pendente.</p>
            ) : (
              pendingTasks.map((task) => {
                const days = task.dueDate ? daysUntil(task.dueDate) : null;
                return (
                  <div key={task.id} className="home-list-item">
                    <span className="home-list-left">{task.title}</span>
                    {days !== null && (
                      <span
                        className="home-chip"
                        style={{
                          background: days < 0 ? 'var(--over-bg)' : days <= 2 ? 'var(--warning-bg)' : 'var(--surface-2)',
                          color: days < 0 ? 'var(--over)' : days <= 2 ? 'var(--warning)' : 'var(--text-muted)',
                        }}
                      >
                        {days < 0 ? `${Math.abs(days)}d atraso` : days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `${days}d`}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="card home-clickable" onClick={() => navigate('/estudos')}>
            <div className="home-row-space" style={{ marginBottom: 10 }}>
              <p className="home-label">Progresso geral</p>
              <p className="home-value-inline" style={{ color: 'var(--primary)' }}>
                {studies?.totals.overallProgress ?? 0}%
              </p>
            </div>
            {topSubjects.length === 0 ? (
              <p className="home-sub">Nenhuma matéria cadastrada.</p>
            ) : (
              topSubjects.map((subj) => (
                <div key={subj.id} className="home-subj-row">
                  <span className="home-subj-dot" style={{ background: subj.color }} />
                  <span className="home-subj-name">{subj.name}</span>
                  <div className="home-subj-bar">
                    <div className="home-subj-fill" style={{ width: `${subj.progress}%`, background: subj.color }} />
                  </div>
                  <span className="home-subj-pct">{subj.progress}%</span>
                </div>
              ))
            )}
          </div>
        </motion.section>

      </motion.div>

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
    </>
  );
}
