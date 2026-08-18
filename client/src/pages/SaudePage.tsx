import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { WaterDay } from '../api/types';
import { todayIso } from '../utils/format';
import { PageHeader } from '../components/PageHeader';
import { springSmooth, springTap } from '../lib/motion';

const QUICK_ADDS = [
  { label: 'Copo', ml: 250 },
  { label: 'Garrafa', ml: 600 },
  { label: 'Garrafão', ml: 1000 },
];

function formatMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
  return `${ml} ml`;
}

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
          cx="100" cy="100" r={r}
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
            key="done" className="water-ring-center"
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <motion.span className="water-ring-check" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.1, duration: 0.4 }}>
              ✓
            </motion.span>
            <span className="water-ring-done-label">Meta atingida!</span>
            <span className="water-ring-amount">{formatMl(consumedMl)}</span>
          </motion.div>
        ) : (
          <motion.div key="progress" className="water-ring-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="water-ring-pct">{percent}%</span>
            <span className="water-ring-amount">{formatMl(consumedMl)}</span>
            <span className="water-ring-goal">de {formatMl(goalMl)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SaudePage() {
  const [waterDay, setWaterDay] = useState<WaterDay | null>(null);
  const [waterLoading, setWaterLoading] = useState(true);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [customMl, setCustomMl] = useState('');
  const waterLoadRef = useRef(0);
  const currentDateRef = useRef(new Date().toDateString());

  const loadWater = useCallback(async () => {
    const id = ++waterLoadRef.current;
    setWaterError(null);
    try {
      const d = await api.getWaterDay(todayIso());
      if (id !== waterLoadRef.current) return;
      setWaterDay(d);
    } catch (err) {
      if (id !== waterLoadRef.current) return;
      setWaterError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (id === waterLoadRef.current) setWaterLoading(false);
    }
  }, []);

  useEffect(() => { void loadWater(); }, [loadWater]);

  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toDateString();
      if (today !== currentDateRef.current) {
        currentDateRef.current = today;
        void loadWater();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadWater]);

  async function resetWaterDay() {
    if (!confirm('Resetar contagem de água de hoje?')) return;
    await api.resetWaterDay(todayIso());
    await loadWater();
  }

  async function addWater(ml: number) {
    if (!waterDay) return;
    setWaterDay({
      ...waterDay,
      consumedMl: waterDay.consumedMl + ml,
      percent: Math.min(100, Math.round(((waterDay.consumedMl + ml) / waterDay.goalMl) * 100)),
    });
    try {
      await api.addWaterEntry(ml, todayIso());
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

  return (
    <div className="page">
      <PageHeader title="Água" />

      {waterLoading && !waterDay ? (
        <div className="center-pad"><div className="spinner" /></div>
      ) : waterError ? (
        <div className="alert alert-error">{waterError}</div>
      ) : waterDay ? (
        <motion.section
          className="card overview-item water-hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSmooth}
        >
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
              type="number" inputMode="numeric" placeholder="Outro valor (ml)"
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
                  type="number" inputMode="numeric" className="water-goal-input"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGoal()}
                  autoFocus
                />
                <button className="btn-primary btn-sm" onClick={saveGoal}>Salvar</button>
                <button className="btn-ghost btn-sm" onClick={() => setEditingGoal(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="hint">Meta diária: {formatMl(waterDay.goalMl)}</span>
                <button className="btn-ghost btn-sm" onClick={() => { setGoalInput(String(waterDay.goalMl)); setEditingGoal(true); }}>
                  Alterar meta
                </button>
                <button className="btn-ghost btn-sm" onClick={resetWaterDay}>Resetar dia</button>
              </>
            )}
          </div>
        </motion.section>
      ) : null}
    </div>
  );
}
