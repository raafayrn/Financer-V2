import { useState, type FormEvent } from 'react';
import type { Account, Income, IncomeInput } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';
import { Modal } from './Modal';

interface Props {
  accounts: Account[];
  initial?: Partial<Income>;
  defaultAccountId?: string;
  title: string;
  onCancel: () => void;
  onSubmit: (data: IncomeInput) => Promise<void>;
}

/**
 * Modal para lançamentos de renda avulsa (ex.: vale-alimentação convertido em
 * Pix). Quando a conta escolhida é a Carteira, o valor passa a compor o
 * saldo dela no mês.
 */
export function IncomeFormModal({ accounts, initial, defaultAccountId, title, onCancel, onSubmit }: Props) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(
    initial?.amount !== undefined ? String(initial.amount) : '',
  );
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccountId ?? '');
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
        amount: value,
        date,
        accountId: accountId || null,
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
              placeholder='Ex.: "Vale convertido em Pix"'
              required
              maxLength={200}
              autoFocus
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

          <label className="field">
            <span>Vai para</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Não afeta nenhuma conta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            Escolha a Carteira (Pix) se esse dinheiro vai ficar disponível lá para gastar depois.
          </p>

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
