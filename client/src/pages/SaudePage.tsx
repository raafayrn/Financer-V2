import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  afterWorkoutChange,
  useAddWaterEntry,
  useCreateWorkoutSession,
  useDeleteWorkoutSession,
  useExerciseHistory,
  useResetWaterDay,
  useSetWaterGoal,
  useUpdateWorkoutSession,
  useWaterDay,
  useWorkoutPlan,
  useWorkoutSummary,
  useWorkoutToday,
} from '../api/queries';
import type { WorkoutSession, WorkoutSessionInput } from '../api/types';
import { formatDayMonth, todayIso } from '../utils/format';
import { CheckIcon, DumbbellIcon, EditIcon, FlameIcon, HeartPulseIcon, PlayCircleIcon, PlusIcon } from '../components/icons';
import { exerciseVideoSearchUrl } from '../utils/exerciseLibrary';
import { WorkoutSessionModal } from '../components/WorkoutSessionModal';
import { WorkoutPlanModal } from '../components/WorkoutPlanModal';
import { SkeletonBlock, SkeletonCircle, SkeletonLine, SkeletonRows } from '../components/Skeleton';
import { springSmooth, springTap } from '../lib/motion';
import { EmptyState } from '../components/EmptyState';

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const overviewContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

// Botões rápidos de adição de água (ml).
const QUICK_ADDS = [
  { label: 'Garrafa', ml: 600 },
];

function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
  return `${ml} ml`;
}

/** Anel de progresso de água (estilo Apple). */
function WaterRing({ percent, consumedMl, goalMl }: { percent: number; consumedMl: number; goalMl: number }) {
  const r = 82;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, percent) / 100) * c;
  const done = percent >= 100;
  return (
    <div className="water-ring">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} className="water-ring-track" />
        <motion.circle
          cx="100"
          cy="100"
          r={r}
          className={done ? 'water-ring-fill water-ring-fill--done' : 'water-ring-fill'}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - dash }}
          transition={springSmooth}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            className="water-ring-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <motion.span
              className="water-ring-check"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              ✓
            </motion.span>
            <span className="water-ring-done-label">Meta atingida!</span>
            <span className="water-ring-amount">{formatMl(consumedMl)}</span>
          </motion.div>
        ) : (
          <motion.div
            key="progress"
            className="water-ring-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="water-ring-pct">{percent}%</span>
            <span className="water-ring-amount">{formatMl(consumedMl)}</span>
            <span className="water-ring-goal">de {formatMl(goalMl)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Mini gráfico de linha (evolução de carga). */
function LineChart({ points }: { points: { date: string; maxWeight: number }[] }) {
  if (points.length === 0) return <EmptyState compact title="Sem dados ainda" />;
  const w = 300;
  const h = 90;
  const pad = 6;
  const weights = points.map((p) => p.maxWeight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.maxWeight - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={path} className="line-chart-path" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} className="line-chart-dot" />
      ))}
    </svg>
  );
}

export function SaudePage() {
  const qc = useQueryClient();

  // ---------- Água ----------
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [customMl, setCustomMl] = useState('');

  // A data local entra na query key: o dia do usuário é o do aparelho dele,
  // nunca o do relógio do servidor. Quando o dia vira, a key muda e o novo dia
  // é buscado sozinho — é o que o antigo currentDateRef fazia na mão.
  const [waterDate, setWaterDate] = useState(todayIso());
  useEffect(() => {
    const interval = setInterval(() => {
      const iso = todayIso();
      setWaterDate((prev) => (prev === iso ? prev : iso));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const waterQuery = useWaterDay(waterDate);
  const addWaterEntry = useAddWaterEntry();
  const setWaterGoal = useSetWaterGoal();
  const resetDay = useResetWaterDay();
  const waterDay = waterQuery.data;

  async function resetWaterDay() {
    if (!confirm('Resetar contagem de água de hoje?')) return;
    await resetDay.mutateAsync(waterDate);
  }

  /** O anel responde na hora: a inserção otimista está em useAddWaterEntry. */
  async function addWater(ml: number) {
    await addWaterEntry.mutateAsync({ ml, date: waterDate });
  }

  async function addCustomWater() {
    const ml = Math.round(Number(customMl));
    if (!Number.isFinite(ml) || ml <= 0) return;
    setCustomMl('');
    await addWater(ml);
  }

  async function saveGoal() {
    const ml = Math.round(Number(goalInput));
    if (!Number.isFinite(ml) || ml < 100) return;
    await setWaterGoal.mutateAsync(ml);
    setEditingGoal(false);
  }

  // ---------- Treinos ----------
  const [sessionModal, setSessionModal] = useState<{ mode: 'create' | 'edit'; session?: WorkoutSession } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const todayQuery = useWorkoutToday();
  const summaryQuery = useWorkoutSummary();
  const planQuery = useWorkoutPlan();
  // O histórico só é buscado quando um exercício está aberto, e fica em cache
  // por nome: reabrir o mesmo exercício não refaz a requisição.
  const historyQuery = useExerciseHistory(expanded);

  const createSession = useCreateWorkoutSession();
  const updateSession = useUpdateWorkoutSession();
  const removeSession = useDeleteWorkoutSession();

  const today = todayQuery.data;
  const summary = summaryQuery.data;
  const plan = planQuery.data ?? [];
  const exerciseHistory = historyQuery.data ?? null;

  async function saveSession(data: WorkoutSessionInput) {
    if (sessionModal?.mode === 'edit' && sessionModal.session) {
      await updateSession.mutateAsync({ id: sessionModal.session.id, data });
    } else {
      await createSession.mutateAsync(data);
    }
    setSessionModal(null);
  }
  async function deleteSession(id: string) {
    if (!confirm('Excluir este treino registrado?')) return;
    await removeSession.mutateAsync(id);
  }

  function toggleExercise(name: string) {
    setExpanded((prev) => (prev === name ? null : name));
  }

  const queries = [waterQuery, todayQuery, summaryQuery, planQuery];
  const loading = queries.some((q) => q.isPending);
  const error = queries.find((q) => q.error)?.error;
  const ready = !!waterDay && !!today && !!summary;

  return (
    <div className="page">
      <div className="section-head">
        <h2 className="page-title">Saúde</h2>
        <motion.button className="btn-ghost btn-sm" onClick={() => setPlanOpen(true)} whileTap={{ scale: 0.95 }} transition={springTap}>
          Rotina semanal
        </motion.button>
      </div>

      {loading && !ready ? (
        <div className="overview-grid">
          {/* Água: 200px é o diâmetro do anel real (.water-ring). */}
          <section className="card overview-item overview-span-2 water-hero">
            <SkeletonCircle size={200} />
            <SkeletonLine width="140px" height="18px" />
            <SkeletonLine width="180px" height="13px" />
          </section>
          <section className="card overview-item overview-span-2">
            <SkeletonLine width="38%" height="15px" />
            <SkeletonLine width="60%" height="22px" />
            <SkeletonRows count={3} circle={false} />
          </section>
          <section className="card overview-item overview-span-2">
            <SkeletonLine width="42%" height="15px" />
            <SkeletonRows count={3} circle={false} />
          </section>
        </div>
      ) : error ? (
        <div className="alert alert-error">
          {error instanceof ApiError ? error.message : 'Erro ao carregar.'}
        </div>
      ) : waterDay && today && summary ? (
        <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
          {/* Água */}
          <motion.section className="card overview-item overview-span-2 water-hero" variants={overviewItem}>
            <WaterRing percent={waterDay.percent} consumedMl={waterDay.consumedMl} goalMl={waterDay.goalMl} />

            <div className="water-quick">
              {QUICK_ADDS.map((q) => (
                <motion.button
                  key={q.ml}
                  className="water-quick-btn"
                  onClick={() => addWater(q.ml)}
                  whileTap={{ scale: 0.92 }}
                  transition={springTap}
                >
                  <span className="water-quick-label">{q.label}</span>
                  <span className="water-quick-ml">+{q.ml} ml</span>
                </motion.button>
              ))}
            </div>

            <div className="water-custom">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Outro valor (ml)"
                value={customMl}
                onChange={(e) => setCustomMl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomWater()}
              />
              <motion.button className="btn-primary btn-sm" onClick={addCustomWater} whileTap={{ scale: 0.95 }} transition={springTap}>
                Adicionar
              </motion.button>
            </div>

            <div className="water-goal-row">
              {editingGoal ? (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="water-goal-input"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveGoal()}
                    autoFocus
                  />
                  <button className="btn-primary btn-sm" onClick={saveGoal}>
                    Salvar
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setEditingGoal(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="hint">Meta diária: {formatMl(waterDay.goalMl)}</span>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setGoalInput(String(waterDay.goalMl));
                      setEditingGoal(true);
                    }}
                  >
                    Alterar meta
                  </button>
                  <button className="btn-ghost btn-sm" onClick={resetWaterDay}>
                    Resetar dia
                  </button>
                </>
              )}
            </div>
          </motion.section>

          {/* Treino de hoje em destaque */}
          <motion.section className="card overview-item overview-span-2 today-card" variants={overviewItem}>
            <div className="today-head">
              <div>
                <span className="today-weekday">{WEEKDAYS[today.weekday]}</span>
                <h3 className="today-title">
                  {today.session ? today.session.title : today.day ? today.day.name : 'Sem treino definido'}
                </h3>
              </div>
              {today.session ? (
                <span className="today-badge done">
                  <CheckIcon /> Feito
                </span>
              ) : today.day && today.day.kind === 'REST' ? (
                <span className="today-badge rest">Descanso</span>
              ) : null}
            </div>

            {today.session ? (
              <>
                <p className="hint">
                  {today.session.sets.length} séries registradas
                  {today.session.durationMin ? ` · ${today.session.durationMin} min` : ''}
                  {today.session.distanceKm ? ` · ${today.session.distanceKm} km` : ''}
                </p>
                <div className="today-actions">
                  <motion.button
                    className="btn-primary btn-sm"
                    onClick={() => setSessionModal({ mode: 'edit', session: today.session! })}
                    whileTap={{ scale: 0.95 }}
                    transition={springTap}
                  >
                    <EditIcon /> Editar treino
                  </motion.button>
                  <button className="btn-ghost btn-sm" onClick={() => deleteSession(today.session!.id)}>
                    Excluir
                  </button>
                </div>
              </>
            ) : (
              <>
                {today.day && today.day.exercises.length > 0 ? (
                  <ul className="today-ex-list">
                    {today.day.exercises.map((ex) => (
                      <li key={ex.id} className="today-ex-row">
                        <span className="today-ex-name">{ex.name}</span>
                        <span className="today-ex-target">
                          {ex.targetSets ? `${ex.targetSets}×${ex.targetReps ?? '?'}` : ex.targetReps ?? ''}
                        </span>
                        <a
                          className="icon-btn"
                          title="Ver vídeo de execução"
                          href={exerciseVideoSearchUrl(ex.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <PlayCircleIcon />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : today.day && today.day.kind === 'REST' ? (
                  <EmptyState
                    icon={<HeartPulseIcon />}
                    title="Dia de descanso"
                    description="Descanso faz parte do plano — aproveite para recuperar."
                  />
                ) : (
                  <EmptyState
                    icon={<DumbbellIcon />}
                    title="Nenhum treino para hoje"
                    description="Monte a rotina semanal uma vez e cada dia passa a saber o que treinar."
                    action={{ label: 'Rotina semanal', onClick: () => setPlanOpen(true) }}
                  />
                )}
                <div className="today-actions">
                  <motion.button
                    className="btn-primary"
                    onClick={() => setSessionModal({ mode: 'create' })}
                    whileTap={{ scale: 0.95 }}
                    transition={springTap}
                  >
                    <PlusIcon /> Registrar treino
                  </motion.button>
                </div>
              </>
            )}
          </motion.section>

          {/* Treinos na semana */}
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Treinos na semana</span>
            <span className="stat-value">{summary.thisWeekCount}</span>
          </motion.div>

          {/* Evolução de carga */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <h3 className="section-title">Evolução de carga</h3>
            {summary.exercises.length === 0 ? (
              <EmptyState
                icon={<FlameIcon />}
                title="Sem evolução para mostrar"
                description="Registre treinos com carga e peso para ver a progressão e os recordes por exercício."
                action={{ label: 'Registrar treino', onClick: () => setSessionModal({ mode: 'create' }) }}
              />
            ) : (
              <ul className="exercise-list">
                {summary.exercises.map((ex) => (
                  <li key={ex.name} className="exercise-item">
                    <button className="exercise-row" onClick={() => toggleExercise(ex.name)}>
                      <div className="exercise-main">
                        <span className="exercise-name">{ex.name}</span>
                        <span className="exercise-meta">Último: {ex.lastWeight} kg · {formatDayMonth(ex.lastDate)}</span>
                      </div>
                      <span className="exercise-pr" title="Recorde">
                        PR {ex.pr} kg
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded === ex.name && (
                        <motion.div
                          className="exercise-history"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={springSmooth}
                          style={{ overflow: 'hidden' }}
                        >
                          {exerciseHistory && exerciseHistory.name === ex.name ? (
                            <LineChart points={exerciseHistory.points} />
                          ) : (
                            // 90px é a altura do LineChart: o gráfico nasce no
                            // lugar do bloco, sem empurrar a linha de baixo.
                            <SkeletonBlock height="90px" />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        </motion.div>
      ) : null}

      {sessionModal && (
        <WorkoutSessionModal
          title={sessionModal.mode === 'edit' ? 'Editar treino' : 'Registrar treino'}
          day={sessionModal.mode === 'create' ? today?.day : null}
          initial={sessionModal.session}
          onCancel={() => setSessionModal(null)}
          onSubmit={saveSession}
        />
      )}
      {planOpen && (
        <WorkoutPlanModal plan={plan} onClose={() => setPlanOpen(false)} onChanged={() => afterWorkoutChange(qc)} />
      )}
    </div>
  );
}
