import { useState, type FormEvent } from 'react';
import type { BodyMetric, BodyMetricInput } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';

interface Props {
  initial?: BodyMetric | null;
  onCancel: () => void;
  onSubmit: (data: BodyMetricInput) => Promise<void>;
}

const MEASURE_FIELDS: { key: keyof BodyMetricInput; label: string; unit: string }[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'bodyFat', label: 'Gordura', unit: '%' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  { key: 'chestCm', label: 'Peito', unit: 'cm' },
  { key: 'armCm', label: 'Braço', unit: 'cm' },
  { key: 'hipCm', label: 'Quadril', unit: 'cm' },
  { key: 'thighCm', label: 'Coxa', unit: 'cm' },
];

export function BodyMetricModal({ initial, onCancel, onSubmit }: Props) {
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of MEASURE_FIELDS) {
      const raw = initial?.[f.key as keyof BodyMetric];
      v[f.key] = raw != null ? String(raw) : '';
    }
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data: BodyMetricInput = { date };
    let any = false;
    for (const f of MEASURE_FIELDS) {
      const raw = values[f.key];
      if (raw) {
        const n = Number(raw.replace(',', '.'));
        if (Number.isFinite(n) && n > 0) {
          (data as unknown as Record<string, unknown>)[f.key] = n;
          any = true;
        }
      }
    }
    if (!any) {
      setError('Informe ao menos o peso ou uma medida.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">Peso e medidas</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <label className="field">
              <span>Data</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <div className="body-fields">
              {MEASURE_FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span>
                    {f.label} ({f.unit})
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[f.key]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="—"
                  />
                </label>
              ))}
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
