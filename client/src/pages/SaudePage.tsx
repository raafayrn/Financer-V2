import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type {
  ExerciseHistory,
  WaterDay,
  WorkoutDay,
  WorkoutSession,
  WorkoutSessionInput,
  WorkoutSummary,
  WorkoutToday,
} from '../api/types';
import { formatDayMonth } from '../utils/format';
import { CheckIcon, EditIcon, PlayCircleIcon, PlusIcon } from '../components/icons';
import { exerciseVideoSearchUrl } from '../utils/exerciseLibrary';
import { WorkoutSessionModal } from '../components/WorkoutSessionModal';
import { WorkoutPlanModal } from '../components/WorkoutPlanModal';
import { springSmooth, springTap } from '../lib/motion';

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const overviewContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

// Botões rápidos de adição de água (ml).
const QUICK_ADDS = [
  { label: 'Copo', ml: 200 },
  { label: 'Garrafa', ml: 500 },
  { label: 'Grande', ml: 750 },
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
  return (
    <div className="water-ring">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} className="water-ring-track" />
        <motion.circle
          cx="100"
          cy="100"
          r={r}
          className="water-ring-fill"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - dash }}
          transition={springSmooth}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="water-ring-center">
        <span className="water-ring-pct">{percent}%</span>
        <span className="water-ring-amount">{formatMl(consumedMl)}</span>
        <span className="water-ring-goal">de {formatMl(goalMl)}</span>
      </div>
    </div>
  );
}

/** Mini gráfico de linha (evolução de carga). */
function LineChart({ points }: { points: { date: string; maxWeight: number }[] }) {
  if (points.length === 0) return <p className="empty">Sem dados ainda.</p>;
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
  // ---------- Água ----------
  const [waterDay, setWaterDay] = useState<WaterDay | null>(null);
  const [waterLoading, setWaterLoading] = useState(true);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [customMl, setCustomMl] = useState('');
  const waterLoadRef = useRef(0);

  const loadWater = useCallback(async () => {
    const id = ++waterLoadRef.current;
    setWaterError(null);
    try {
      const d = await api.getWaterDay();
      if (id !== waterLoadRef.current) return;
      setWaterDay(d);
    } catch (err) {
      if (id !== waterLoadRef.current) return;
      setWaterError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (id === waterLoadRef.current) setWaterLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWater();
  }, [loadWater]);

  async function addWater(ml: number) {
    if (!waterDay) return;
    // Atualização otimista para resposta instantânea.
    setWaterDay({
      ...waterDay,
      consumedMl: waterDay.consumedMl + ml,
      percent: Math.min(100, Math.round(((waterDay.consumedMl + ml) / waterDay.goalMl) * 100)),
    });
    try {
      await api.addWaterEntry(ml);
      await loadWater();
    } catch {
      await loadWater();
    }
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
    await api.setWaterGoal(ml);
    setEditingGoal(false);
    await loadWater();
  }

  // ---------- Treinos ----------
  const [today, setToday] = useState<WorkoutToday | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [plan, setPlan] = useState<WorkoutDay[]>([]);
  const [workoutLoading, setWorkoutLoading] = useState(true);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [sessionModal, setSessionModal] = useState<{ mode: 'create' | 'edit'; session?: WorkoutSession } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistory | null>(null);

  const workoutLoadRef = useRef(0);

  const loadWorkouts = useCallback(async () => {
    const id = ++workoutLoadRef.current;
    setWorkoutError(null);
    try {
      const [t, s, p] = await Promise.all([api.getWorkoutToday(), api.getWorkoutSummary(), api.getWorkoutPlan()]);
      if (id !== workoutLoadRef.current) return;
      setToday(t);
      setSummary(s);
      setPlan(p);
    } catch (err) {
      if (id !== workoutLoadRef.current) return;
      setWorkoutError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (id === workoutLoadRef.current) setWorkoutLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkouts();
  }, [loadWorkouts]);

  async function saveSession(data: WorkoutSessionInput) {
    if (sessionModal?.mode === 'edit' && sessionModal.session) {
      await api.updateWorkoutSession(sessionModal.session.id, data);
    } else {
      await api.createWorkoutSession(data);
    }
    setSessionModal(null);
    await loadWorkouts();
  }
  async function deleteSession(id: string) {
    if (!confirm('Excluir este treino registrado?')) return;
    await api.deleteWorkoutSession(id);
    await loadWorkouts();
  }

  async function toggleExercise(name: string) {
    if (expanded === name) {
      setExpanded(null);
      setExerciseHistory(null);
      return;
    }
    setExpanded(name);
    setExerciseHistory(null);
    try {
      setExerciseHistory(await api.getExerciseHistory(name));
    } catch {
      /* ignora */
    }
  }

  const loading = waterLoading || workoutLoading;
  const error = waterError || workoutError;
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
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
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
                  <p className="empty">Dia de descanso. Aproveite para recuperar! 💤</p>
                ) : (
                  <p className="empty">Nenhum treino configurado para hoje. Toque em “Rotina semanal” para montar.</p>
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
              <p className="empty">Registre treinos com carga para ver sua evolução e recordes aqui.</p>
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
                            <div className="center-pad">
                              <div className="spinner" />
                            </div>
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
        <WorkoutPlanModal plan={plan} onClose={() => setPlanOpen(false)} onChanged={() => void loadWorkouts()} />
      )}
    </div>
  );
}
