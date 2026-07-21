import { useState, type FormEvent } from 'react';
import type { WorkoutDay, WorkoutKind } from '../api/types';
import { api, ApiError } from '../api/client';
import { Modal } from './Modal';
import { PlayCircleIcon, PlusIcon, TrashIcon } from './icons';
import { DAY_PRESETS, exerciseVideoSearchUrl, exercisesForGroups, type DayPreset } from '../utils/exerciseLibrary';

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const KIND_OPTIONS: { value: WorkoutKind; label: string }[] = [
  { value: 'STRENGTH', label: 'Musculação' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'MIXED', label: 'Misto' },
  { value: 'REST', label: 'Descanso' },
];

interface Props {
  plan: WorkoutDay[];
  onClose: () => void;
  onChanged: () => void;
}

export function WorkoutPlanModal({ plan: initialPlan, onClose, onChanged }: Props) {
  const [plan, setPlan] = useState<WorkoutDay[]>(initialPlan);
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Campos do novo exercício.
  const [exName, setExName] = useState('');
  const [exMuscle, setExMuscle] = useState('');
  const [exSets, setExSets] = useState('');
  const [exReps, setExReps] = useState('');

  const day = plan.find((d) => d.weekday === weekday) ?? null;
  const [dayName, setDayName] = useState(day?.name ?? '');
  const [dayKind, setDayKind] = useState<WorkoutKind>(day?.kind ?? 'STRENGTH');

  async function reload() {
    const fresh = await api.getWorkoutPlan();
    setPlan(fresh);
    onChanged();
    return fresh;
  }

  function selectWeekday(wd: number) {
    setWeekday(wd);
    const d = plan.find((x) => x.weekday === wd) ?? null;
    setDayName(d?.name ?? '');
    setDayKind(d?.kind ?? 'STRENGTH');
    setError(null);
  }

  async function saveDay() {
    setError(null);
    if (!dayName.trim()) {
      setError('Informe o nome do treino do dia.');
      return;
    }
    try {
      await api.setWorkoutDay(weekday, { name: dayName.trim(), kind: dayKind });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    }
  }

  async function clearDay() {
    if (!day) return;
    try {
      await api.deleteWorkoutDay(weekday);
      setDayName('');
      setDayKind('STRENGTH');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao limpar.');
    }
  }

  /** Gera o treino do dia automaticamente a partir do(s) grupo(s) muscular(es) do preset. */
  async function generateFromPreset(preset: DayPreset) {
    setError(null);
    const currentExercises = day?.exercises ?? [];
    if (currentExercises.length > 0) {
      const ok = confirm(
        `Isso vai substituir os ${currentExercises.length} exercício(s) atuais de ${WEEKDAYS_SHORT[weekday]}. Continuar?`,
      );
      if (!ok) return;
    }
    setGenerating(true);
    try {
      const savedDay = await api.setWorkoutDay(weekday, { name: preset.label, kind: preset.kind });
      setDayName(preset.label);
      setDayKind(preset.kind);

      for (const ex of savedDay.exercises) {
        await api.deleteWorkoutExercise(ex.id);
      }
      const toAdd = exercisesForGroups(preset.groups);
      for (const ex of toAdd) {
        await api.addWorkoutExercise(weekday, {
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao gerar treino.');
    } finally {
      setGenerating(false);
    }
  }

  async function addExercise(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!day) {
      setError('Salve o treino do dia antes de adicionar exercícios.');
      return;
    }
    if (!exName.trim()) return;
    try {
      await api.addWorkoutExercise(weekday, {
        name: exName.trim(),
        muscleGroup: exMuscle.trim() || null,
        targetSets: exSets ? Math.round(Number(exSets)) : null,
        targetReps: exReps.trim() || null,
      });
      setExName('');
      setExMuscle('');
      setExSets('');
      setExReps('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao adicionar.');
    }
  }

  async function removeExercise(id: string) {
    await api.deleteWorkoutExercise(id);
    await reload();
  }

  return (
    <Modal onCancel={onClose}>
      {(close) => (
        <>
          <h2 className="modal-title">Rotina semanal</h2>
          <p className="hint" style={{ marginTop: -6 }}>
            Defina o que você treina em cada dia da semana.
          </p>

          <div className="weekday-tabs">
            {WEEKDAYS_SHORT.map((label, wd) => {
              const has = plan.some((d) => d.weekday === wd && d.kind !== 'REST');
              return (
                <button
                  key={wd}
                  type="button"
                  className={`weekday-tab${wd === weekday ? ' active' : ''}${has ? ' has-workout' : ''}`}
                  onClick={() => selectWeekday(wd)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="modal-form">
            <div className="field">
              <span>Gerar treino automático (por grupo muscular)</span>
              <div className="chip-row">
                {DAY_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    disabled={generating}
                    onClick={() => generateFromPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                Escolha um grupo e o app monta os exercícios pra você. Dá pra editar depois.
              </p>
            </div>

            <div className="field-row">
              <label className="field" style={{ flex: 2 }}>
                <span>Treino do dia</span>
                <input
                  type="text"
                  value={dayName}
                  onChange={(e) => setDayName(e.target.value)}
                  placeholder="Ex.: Peito e tríceps / Corrida / Descanso"
                  maxLength={80}
                />
              </label>
            </div>
            <div className="field">
              <span>Tipo</span>
              <div className="chip-row">
                {KIND_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`chip ${dayKind === o.value ? 'chip-active' : ''}`}
                    onClick={() => setDayKind(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              {day && (
                <button type="button" className="btn-ghost btn-sm" onClick={clearDay}>
                  Limpar dia
                </button>
              )}
              <button type="button" className="btn-primary btn-sm" onClick={saveDay}>
                Salvar dia
              </button>
            </div>

            {day && day.kind !== 'REST' && (
              <>
                <h3 className="section-title" style={{ marginTop: 8 }}>
                  Exercícios ({day.exercises.length})
                </h3>
                {day.exercises.length > 0 && (
                  <ul className="plan-ex-list">
                    {day.exercises.map((ex) => (
                      <li key={ex.id} className="plan-ex-row">
                        <div className="plan-ex-main">
                          <span className="plan-ex-name">{ex.name}</span>
                          <span className="plan-ex-meta">
                            {[ex.muscleGroup, ex.targetSets ? `${ex.targetSets}x${ex.targetReps ?? '?'}` : ex.targetReps]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <a
                          className="icon-btn"
                          title="Ver vídeo de execução"
                          href={exerciseVideoSearchUrl(ex.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <PlayCircleIcon />
                        </a>
                        <button type="button" className="icon-btn" title="Remover" onClick={() => removeExercise(ex.id)}>
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={addExercise} className="plan-ex-add">
                  <input type="text" value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Exercício" />
                  <input type="text" value={exMuscle} onChange={(e) => setExMuscle(e.target.value)} placeholder="Grupo" />
                  <input type="number" inputMode="numeric" value={exSets} onChange={(e) => setExSets(e.target.value)} placeholder="Séries" className="plan-ex-num" />
                  <input type="text" value={exReps} onChange={(e) => setExReps(e.target.value)} placeholder="Reps" className="plan-ex-num" />
                  <button type="submit" className="btn-primary btn-sm">
                    <PlusIcon />
                  </button>
                </form>
              </>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={close}>
                Concluído
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
