import { useState, type FormEvent } from 'react';
import type { Investment, InvestmentInput, InvestmentKind, InvestmentType } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import { INVESTMENT_TYPE_LABEL } from '../utils/investments';

interface Props {
  initial?: Partial<Investment>;
  title: string;
  onCancel: () => void;
  onSubmit: (data: InvestmentInput) => Promise<void>;
}

const TYPE_OPTIONS = (Object.keys(INVESTMENT_TYPE_LABEL) as InvestmentType[]).map((type) => ({
  value: type,
  label: INVESTMENT_TYPE_LABEL[type],
}));

export function InvestmentFormModal({ initial, title, onCancel, onSubmit }: Props) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(
    initial?.amount !== undefined ? String(initial.amount) : '',
  );
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [type, setType] = useState<InvestmentType>(initial?.type ?? 'RENDA_FIXA');
  const [kind, setKind] = useState<InvestmentKind>(initial?.kind ?? 'APORTE');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        description: description.trim(),
        type,
        kind,
        amount: value,
        date,
        notes: notes.trim() || null,
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
            <label className="field">
              <span>Descrição</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={200}
                autoFocus
                placeholder="Ex.: Tesouro Selic 2029"
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Valor (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  required
                />
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </div>

            <div className="field-row">
              <div className="field">
                <span>Tipo</span>
                <Dropdown value={type} onChange={(v) => setType(v as InvestmentType)} ariaLabel="Tipo" options={TYPE_OPTIONS} />
              </div>
              <div className="field">
                <span>Movimento</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${kind === 'APORTE' ? 'chip-active' : ''}`}
                    onClick={() => setKind('APORTE')}
                  >
                    Aporte
                  </button>
                  <button
                    type="button"
                    className={`chip ${kind === 'RESGATE' ? 'chip-active' : ''}`}
                    onClick={() => setKind('RESGATE')}
                  >
                    Resgate
                  </button>
                </div>
              </div>
            </div>

            <label className="field">
              <span>Observações (opcional)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Ex.: corretora, taxa, vencimento..."
              />
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
