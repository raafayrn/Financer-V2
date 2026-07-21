import { useState, type FormEvent } from 'react';
import type { Exam, StudyTask, Subject } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';

function subjectOptions(subjects: Subject[]) {
  return [{ value: '', label: 'Sem matéria' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))];
}

// ---------- Prova ----------
interface ExamProps {
  subjects: Subject[];
  initial?: Exam | null;
  onCancel: () => void;
  onSubmit: (data: { title: string; date: string; subjectId: string | null; notes: string | null }) => Promise<void>;
}

export function ExamModal({ subjects, initial, onCancel, onSubmit }: ExamProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Informe o título da prova.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), date, subjectId: subjectId || null, notes: notes.trim() || null });
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
                <Dropdown value={subjectId} onChange={setSubjectId} ariaLabel="Matéria" options={subjectOptions(subjects)} />
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
