import { useState, type FormEvent } from 'react';
import type { AgendaEvent, AgendaEventCategory, Exam, StudyTask, Subject } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';

function subjectOptions(subjects: Subject[]) {
  return [{ value: '', label: 'Sem matéria' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))];
}
function subjectOptionsRequired(subjects: Subject[]) {
  return [{ value: '', label: 'Selecione a matéria…' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))];
}

// ---------- Evento da agenda ----------

const CATEGORY_OPTIONS: { value: AgendaEventCategory; label: string }[] = [
  { value: 'CONSULTA', label: 'Consulta' },
  { value: 'EVENTO', label: 'Evento' },
  { value: 'COMPROMISSO', label: 'Compromisso' },
  { value: 'LEMBRETE', label: 'Lembrete' },
  { value: 'OUTRO', label: 'Outro' },
];

interface AgendaEventProps {
  initial?: AgendaEvent | null;
  defaultDate?: string;
  onCancel: () => void;
  onSubmit: (data: {
    title: string;
    date: string;
    time: string | null;
    notes: string | null;
    category: AgendaEventCategory;
  }) => Promise<void>;
}

export function AgendaEventModal({ initial, defaultDate, onCancel, onSubmit }: AgendaEventProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? todayIso());
  const [time, setTime] = useState(initial?.time ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [category, setCategory] = useState<AgendaEventCategory>(initial?.category ?? 'OUTRO');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Informe o título.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        date,
        time: time || null,
        notes: notes.trim() || null,
        category,
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
          <h2 className="modal-title">{initial ? 'Editar evento' : 'Novo evento'}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <label className="field">
              <span>Título</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Consulta médica" autoFocus maxLength={160} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Data</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="field">
                <span>Hora (opcional)</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>
            <div className="field">
              <span>Categoria</span>
              <Dropdown
                value={category}
                onChange={(v) => setCategory(v as AgendaEventCategory)}
                ariaLabel="Categoria"
                options={CATEGORY_OPTIONS}
              />
            </div>
            <label className="field">
              <span>Observações (opcional)</span>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Local, detalhes…" />
            </label>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={close}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

// ---------- Prova ----------
interface ExamProps {
  subjects: Subject[];
  initial?: Exam | null;
  onCancel: () => void;
  onSubmit: (data: {
    title: string;
    date: string;
    subjectId: string | null;
    term: number | null;
    notes: string | null;
  }) => Promise<void>;
}

export function ExamModal({ subjects, initial, onCancel, onSubmit }: ExamProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? '');
  const [term, setTerm] = useState<number | null>(initial?.term ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Informe o título da prova.'); return; }
    if (!subjectId) { setError('Selecione a matéria.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), date, subjectId, term, notes: notes.trim() || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">{initial ? 'Editar prova' : 'Nova prova'}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <label className="field">
              <span>Título</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: P1 de Cálculo" autoFocus maxLength={120} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Data</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <div className="field">
                <span>Matéria</span>
                <Dropdown value={subjectId} onChange={setSubjectId} ariaLabel="Matéria" options={subjectOptionsRequired(subjects)} />
              </div>
            </div>
            <div className="field">
              <span>Bimestre (opcional)</span>
              <div className="ms-segment">
                {([null, 1, 2] as (number | null)[]).map((t) => (
                  <button
                    key={t ?? 'none'}
                    type="button"
                    className={`ms-segment-item${term === t ? ' active' : ''}`}
                    onClick={() => setTerm(t)}
                  >
                    <span>{t === null ? 'Nenhum' : `${t}º`}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Observações (opcional)</span>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Conteúdo, sala, etc." />
            </label>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

// ---------- Tarefa ----------
interface TaskProps {
  subjects: Subject[];
  initial?: StudyTask | null;
  onCancel: () => void;
  onSubmit: (data: { title: string; dueDate: string | null; subjectId: string | null }) => Promise<void>;
}

export function StudyTaskModal({ subjects, initial, onCancel, onSubmit }: TaskProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Informe a tarefa.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), dueDate: dueDate || null, subjectId: subjectId || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">{initial ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <label className="field">
              <span>Tarefa</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Lista 3 de Física" autoFocus maxLength={160} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Prazo (opcional)</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <div className="field">
                <span>Matéria</span>
                <Dropdown value={subjectId} onChange={setSubjectId} ariaLabel="Matéria" options={subjectOptions(subjects)} />
              </div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
