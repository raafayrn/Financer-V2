import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client';
import type {
  Account,
  AgendaEvent,
  AgendaEventCategory,
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

// Quadro de horários fixo (segunda a sexta, 18:55–22:30)
const CLASS_SCHEDULE: Record<number, { time: string; name: string }[]> = {
  // 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex
  1: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  2: [
    { time: '18:55–20:35', name: 'Física Geral e Experimental II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  3: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Física Geral e Experimental II' },
  ],
  4: [
    { time: '18:55–20:35', name: 'Geometria e Álgebra Linear' },
    { time: '20:50–22:30', name: 'Introdução à Ciência dos Materiais' },
  ],
  5: [
    { time: '18:55–20:35', name: 'Desenho e Modelagem Geométrica' },
    { time: '20:50–22:30', name: 'Geometria e Álgebra Linear' },
  ],
};

const CATEGORY_COLORS: Record<AgendaEventCategory, string> = {
  CONSULTA: '#ff6b35',
  EVENTO: '#af52de',
  COMPROMISSO: '#007aff',
  LEMBRETE: '#ffcc00',
  OUTRO: '#8e8e93',
};

const CATEGORY_LABELS: Record<AgendaEventCategory, string> = {
  CONSULTA: 'Consulta',
  EVENTO: 'Evento',
  COMPROMISSO: 'Compromisso',
  LEMBRETE: 'Lembrete',
  OUTRO: 'Outro',
};

const WATER_QUICK_ADDS = [
  { label: 'Garrafa', ml: 600 },
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
  agendaEvents: AgendaEvent[];
}

export function HomePage() {
  const { year, month } = useMonth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData>({
    summary: null, expenses: [], incomes: [], categories: [], accounts: [],
    waterDay: null, workoutToday: null, workoutSummary: null,
    bodyMetrics: [], studies: null, agendaEvents: [],
  });
  const [loading, setLoading] = useState(true);
  const [finModal, setFinModal] = useState<FinModal>('closed');
  const [addingWater, setAddingWater] = useState(false);
  const [hideValues, setHideValues] = useState(() => localStorage.getItem('hideFinValues') === '1');

  const load = useCallback(async () => {
    setLoading(true);
    const [summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies, agendaEvents] =
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
        api.listAgendaEvents().catch((): AgendaEvent[] => []),
      ]);
    setData({ summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies, agendaEvents });
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

  function mask(value: string) {
    return hideValues ? '••••' : value;
  }

  const { summary, expenses, incomes, categories, accounts, waterDay, workoutToday, workoutSummary, bodyMetrics, studies, agendaEvents } = data;

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

  const upcomingAgendaEvents = agendaEvents
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
    .slice(0, 4);

  const budgetStatus = summary?.status ?? 'ok';
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

          <div className="card home-clickable" onClick={() => navigate('/financas')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p className="home-label" style={{ margin: 0 }}>Ainda posso gastar</p>
              <button
                className="icon-btn-outline"
                style={{ padding: '2px 6px' }}
                title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
                onClick={(e) => { e.stopPropagation(); toggleHideValues(); }}
              >
                {hideValues ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p className="home-hero-value" style={{ color: remainingColor }}>
              {mask(formatCurrency(summary?.remaining ?? 0))}
            </p>

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
              <p className="home-value" style={{ color: 'var(--ok)' }}>{mask(formatCurrency(summary?.income.total ?? 0))}</p>
            </div>
            <div className="card">
              <p className="home-label">Gastos</p>
              <p className="home-value" style={{ color: 'var(--over)' }}>{mask(formatCurrency(summary?.totalSpent ?? 0))}</p>
            </div>
          </div>

          <div className="card">
            <div className="home-accounts">
              <div>
                <p className="home-label">Salário</p>
                <p className="home-account-val" style={{ color: (summary?.income.salary ?? 0) - (summary?.accounts.fixed ?? 0) - (summary?.accounts.variable ?? 0) < 0 ? 'var(--over)' : 'var(--ok)' }}>
                  {mask(formatCurrency((summary?.income.salary ?? 0) - (summary?.accounts.fixed ?? 0) - (summary?.accounts.variable ?? 0)))}
                </p>
              </div>
              <div>
                <p className="home-label">VR</p>
                <p className="home-account-val">
                  {mask(formatCurrency((summary?.income.voucher ?? 0) - (summary?.accounts.foodVoucher ?? 0)))}
                </p>
              </div>
              <div>
                <p className="home-label">Carteira</p>
                <p className="home-account-val" style={{ color: (summary?.walletBalance ?? 0) < 0 ? 'var(--over)' : undefined }}>
                  {mask(formatCurrency(summary?.walletBalance ?? 0))}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="home-label" style={{ marginBottom: 8 }}>Fatura estimada (cartão)</p>
            <div className="home-accounts">
              <div>
                <p className="home-label">Fixos</p>
                <p className="home-account-val">{mask(formatCurrency(summary?.accounts.fixed ?? 0))}</p>
              </div>
              <div>
                <p className="home-label">Variáveis</p>
                <p className="home-account-val">{mask(formatCurrency(summary?.accounts.variable ?? 0))}</p>
              </div>
              <div>
                <p className="home-label" style={{ fontWeight: 700 }}>Total</p>
                <p className="home-account-val" style={{ fontWeight: 700, color: 'var(--over)' }}>
                  {mask(formatCurrency((summary?.accounts.fixed ?? 0) + (summary?.accounts.variable ?? 0)))}
                </p>
              </div>
            </div>
          </div>

          <div className="card home-clickable" onClick={() => navigate('/financas')}>
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
                      {hideValues ? '••••' : `${entry.kind === 'income' ? '+' : '−'}${formatCurrency(entry.amount)}`}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatDayMonth(entry.date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.section>

        {/* ===== ESTUDOS ===== */}
        <motion.section className="home-section" variants={fadeUp}>
          <div className="home-section-header">
            <span className="home-section-dot" style={{ background: 'var(--primary)' }} />
            Estudos
          </div>

          <div className="card">
            {(() => {
              const dow = new Date().getDay(); // 0=dom…6=sab
              const todayClasses = CLASS_SCHEDULE[dow];
              const now = new Date();
              const hhmm = now.getHours() * 60 + now.getMinutes();
              const dayLabel = WEEKDAYS_PT[dow];
              return (
                <>
                  <p className="home-label" style={{ marginBottom: 8 }}>
                    Aulas de hoje — <span style={{ color: 'var(--primary)' }}>{dayLabel}</span>
                  </p>
                  {!todayClasses ? (
                    <p className="home-sub">Sem aulas hoje.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {todayClasses.map((c) => {
                        const [startStr] = c.time.split('–');
                        const [sh, sm] = startStr.split(':').map(Number);
                        const [, endStr] = c.time.split('–');
                        const [eh, em] = endStr.split(':').map(Number);
                        const startMin = sh * 60 + sm;
                        const endMin = eh * 60 + em;
                        const ongoing = hhmm >= startMin && hhmm < endMin;
                        const done = hhmm >= endMin;
                        const subj = (studies?.subjects ?? []).find((s) => s.name === c.name);
                        const borderColor = subj?.color ?? 'var(--primary)';
                        return (
                          <div
                            key={c.time}
                            style={{
                              borderLeft: `3px solid ${borderColor}`,
                              paddingLeft: 10,
                              opacity: done ? 0.45 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.time}</span>
                              <span style={{ fontWeight: ongoing ? 700 : 600, fontSize: '0.9rem' }}>{c.name}</span>
                            </div>
                            {ongoing && (
                              <span className="home-chip" style={{ background: 'var(--ok-bg)', color: 'var(--ok)', flexShrink: 0 }}>
                                Agora
                              </span>
                            )}
                            {done && (
                              <span className="home-chip" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', flexShrink: 0 }}>
                                Concluída
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div className="card home-clickable" onClick={() => navigate('/estudos?tab=agenda')}>
            <p className="home-label" style={{ marginBottom: 8 }}>Agenda</p>
            {upcomingAgendaEvents.length === 0 ? (
              <p className="home-sub">Nenhum evento nos próximos 30 dias.</p>
            ) : (
              upcomingAgendaEvents.map((ev) => (
                <div key={ev.id} className="home-list-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 3, borderRadius: 99, alignSelf: 'stretch', background: CATEGORY_COLORS[ev.category], flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: '0.7rem', color: CATEGORY_COLORS[ev.category], fontWeight: 600 }}>
                        {CATEGORY_LABELS[ev.category]}{ev.time ? ` · ${ev.time}` : ''}
                      </span>
                      <span className="home-list-left">{ev.title}</span>
                    </div>
                  </div>
                  <span
                    className="home-chip"
                    style={{
                      background: ev.daysLeft === 0 ? 'var(--over-bg)' : ev.daysLeft <= 3 ? 'var(--warning-bg)' : 'var(--surface-2)',
                      color: ev.daysLeft === 0 ? 'var(--over)' : ev.daysLeft <= 3 ? 'var(--warning)' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {ev.daysLeft === 0 ? 'Hoje' : ev.daysLeft === 1 ? 'Amanhã' : `${ev.daysLeft}d`}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card home-clickable" onClick={() => navigate('/estudos')}>
            <p className="home-label" style={{ marginBottom: 8 }}>Próximas provas</p>
            {upcomingExams.length === 0 ? (
              <p className="home-sub">Nenhuma prova agendada.</p>
            ) : (
              upcomingExams.map((exam) => {
                const examSubjObj = (studies?.subjects ?? []).find((s) => s.id === exam.subjectId);
                return (
                  <div key={exam.id} className="home-list-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {examSubjObj && (
                        <span style={{ fontSize: '0.7rem', color: examSubjObj.color, fontWeight: 600 }}>{examSubjObj.name}</span>
                      )}
                      <span className="home-list-left">{exam.title}</span>
                    </div>
                    <span
                      className="home-chip"
                      style={{
                        background: exam.daysLeft <= 3 ? 'var(--over-bg)' : 'var(--info-bg)',
                        color: exam.daysLeft <= 3 ? 'var(--over)' : 'var(--primary)',
                        flexShrink: 0,
                      }}
                    >
                      {exam.daysLeft === 0 ? 'Hoje' : exam.daysLeft === 1 ? 'Amanhã' : `${exam.daysLeft}d`}
                    </span>
                  </div>
                );
              })
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
                const taskSubj = (studies?.subjects ?? []).find((s) => s.id === task.subjectId);
                return (
                  <div key={task.id} className="home-list-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {taskSubj && <span style={{ fontSize: '0.7rem', color: taskSubj.color, fontWeight: 600 }}>{taskSubj.name}</span>}
                      <span className="home-list-left">{task.title}</span>
                    </div>
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
                {!workoutToday.session && workoutToday.day.exercises.map((ex) => (
                  <div key={ex.id} className="home-list-item">
                    <span className="home-list-left">{ex.name}</span>
                    <span className="home-list-right">
                      {ex.targetSets && ex.targetReps ? `${ex.targetSets}×${ex.targetReps}` : '—'}
                    </span>
                  </div>
                ))}
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
