import { useState, type FormEvent } from 'react';
import type { WorkoutDay, WorkoutKind, WorkoutSession, WorkoutSessionInput } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';
import { PlusIcon, TrashIcon } from './icons';

interface SetRow {
  weight: string;
  reps: string;
}
interface ExerciseRow {
  name: string;
  muscleGroup: string;
  sets: SetRow[];
}

interface Props {
  title: string;
  day?: WorkoutDay | null;
  initial?: WorkoutSession | null;
  onCancel: () => void;
  onSubmit: (data: WorkoutSessionInput) => Promise<void>;
}

const KIND_OPTIONS: { value: WorkoutKind; label: string }[] = [
  { value: 'STRENGTH', label: 'Musculação' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'MIXED', label: 'Misto' },
];

/** Constrói as linhas de exercício iniciais a partir do template ou da sessão. */
function buildInitialExercises(day?: WorkoutDay | null, session?: WorkoutSession | null): ExerciseRow[] {
  if (session && session.sets.length > 0) {
    const byExercise = new Map<string, ExerciseRow>();
    for (const s of session.sets) {
      let ex = byExercise.get(s.exerciseName);
      if (!ex) {
        ex = { name: s.exerciseName, muscleGroup: s.muscleGroup ?? '', sets: [] };
        byExercise.set(s.exerciseName, ex);
      }
      ex.sets.push({ weight: s.weightKg != null ? String(s.weightKg) : '', reps: s.reps != null ? String(s.reps) : '' });
    }
    return Array.from(byExercise.values());
  }
  if (day && day.exercises.length > 0) {
    return day.exercises.map((e) => ({
      name: e.name,
      muscleGroup: e.muscleGroup ?? '',
      sets: Array.from({ length: Math.max(1, e.targetSets ?? 3) }, () => ({ weight: '', reps: e.targetReps ?? '' })),
    }));
  }
  return [{ name: '', muscleGroup: '', sets: [{ weight: '', reps: '' }] }];
}

export function WorkoutSessionModal({ title, day, initial, onCancel, onSubmit }: Props) {
  const [sessionTitle, setSessionTitle] = useState(initial?.title ?? day?.name ?? 'Treino');
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [kind, setKind] = useState<WorkoutKind>(initial?.kind ?? (day?.kind === 'REST' ? 'STRENGTH' : day?.kind) ?? 'STRENGTH');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [durationMin, setDurationMin] = useState(initial?.durationMin != null ? String(initial.durationMin) : '');
  const [distanceKm, setDistanceKm] = useState(initial?.distanceKm != null ? String(initial.distanceKm) : '');
  const [exercises, setExercises] = useState<ExerciseRow[]>(() => buildInitialExercises(day, initial));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showCardio = kind === 'CARDIO' || kind === 'MIXED';

  function updateExercise(idx: number, patch: Partial<ExerciseRow>) {
    setExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function updateSet(exIdx: number, setIdx: number, patch: Partial<SetRow>) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIdx ? { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) } : e,
      ),
    );
  }
  function addSet(exIdx: number) {
    setExercises((prev) => prev.map((e, i) => (i === exIdx ? { ...e, sets: [...e.sets, { weight: '', reps: '' }] } : e)));
  }
  function removeSet(exIdx: number, setIdx: number) {
    setExercises((prev) =>
      prev.map((e, i) => (i === exIdx ? { ...e, sets: e.sets.filter((_, j) => j !== setIdx) } : e)),
    );
  }
  function addExercise() {
    setExercises((prev) => [...prev, { name: '', muscleGroup: '', sets: [{ weight: '', reps: '' }] }]);
  }
  function removeExercise(idx: number) {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sets = exercises
      .filter((ex) => ex.name.trim())
      .flatMap((ex) =>
        ex.sets.map((s, i) => {
          const weight = s.weight ? Number(s.weight.replace(',', '.')) : null;
          const reps = s.reps ? Math.round(Number(s.reps)) : null;
          return {
            exerciseName: ex.name.trim(),
            muscleGroup: ex.muscleGroup.trim() || null,
            setIndex: i + 1,
            weightKg: weight && weight > 0 ? weight : null,
            reps: reps && reps > 0 ? reps : null,
          };
        }),
      );

    setSubmitting(true);
    try {
      await onSubmit({
        date,
        dayId: day?.id ?? initial?.dayId ?? null,
        title: sessionTitle.trim() || 'Treino',
        kind,
        notes: notes.trim() || null,
        durationMin: showCardio && durationMin ? Math.round(Number(durationMin)) : null,
        distanceKm: showCardio && distanceKm ? Number(distanceKm.replace(',', '.')) : null,
        sets,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">{title}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field-row">
              <label className="field" style={{ flex: 2 }}>
                <span>Título</span>
                <input type="text" value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} maxLength={120} />
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </div>

            <div className="field">
              <span>Tipo</span>
              <div className="chip-row">
                {KIND_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`chip ${kind === o.value ? 'chip-active' : ''}`}
                    onClick={() => setKind(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {showCardio && (
              <div className="field-row">
                <label className="field">
                  <span>Duração (min)</span>
                  <input type="number" inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="Ex.: 30" />
                </label>
                <label className="field">
                  <span>Distância (km)</span>
                  <input type="text" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="Ex.: 5" />
                </label>
              </div>
            )}

            <div className="workout-exercises">
              {exercises.map((ex, exIdx) => (
                <div key={exIdx} className="workout-ex-card">
                  <div className="workout-ex-head">
                    <input
                      type="text"
                      className="workout-ex-name"
                      value={ex.name}
                      onChange={(e) => updateExercise(exIdx, { name: e.target.value })}
                      placeholder="Exercício (ex.: Supino reto)"
                    />
                    <button type="button" className="icon-btn" title="Remover exercício" onClick={() => removeExercise(exIdx)}>
                      <TrashIcon />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="workout-ex-muscle"
                    value={ex.muscleGroup}
                    onChange={(e) => updateExercise(exIdx, { muscleGroup: e.target.value })}
                    placeholder="Grupo muscular (ex.: Peito)"
                  />
                  <div className="workout-sets">
                    <div className="workout-set-head">
                      <span>Série</span>
                      <span>Carga (kg)</span>
                      <span>Reps</span>
                      <span />
                    </div>
                    {ex.sets.map((s, setIdx) => (
                      <div key={setIdx} className="workout-set-row">
                        <span className="workout-set-idx">{setIdx + 1}</span>
                        <input type="text" inputMode="decimal" value={s.weight} onChange={(e) => updateSet(exIdx, setIdx, { weight: e.target.value })} placeholder="—" />
                        <input type="number" inputMode="numeric" value={s.reps} onChange={(e) => updateSet(exIdx, setIdx, { reps: e.target.value })} placeholder="—" />
                        <button type="button" className="icon-btn" title="Remover série" onClick={() => removeSet(exIdx, setIdx)}>
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn-ghost btn-sm workout-add-set" onClick={() => addSet(exIdx)}>
                      <PlusIcon /> Série
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={addExercise}>
                <PlusIcon /> Adicionar exercício
              </button>
            </div>

            <label className="field">
              <span>Observações (opcional)</span>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Como foi o treino?" />
            </label>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Salvando…' : 'Salvar treino'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
