import { useState, type FormEvent } from 'react';
import type { Account, Category, Expense, ExpenseInput } from '../api/types';
import { ApiError } from '../api/client';
import { todayIso } from '../utils/format';

interface Props {
  categories: Category[];
  accounts: Account[];
  initial?: Partial<Expense> & { suggestedCategoryName?: string | null };
  title: string;
  /** Exibido junto ao título — usado para "2 de 5" no fluxo de confirmação em lote. */
  progress?: string;
  onCancel: () => void;
  onSubmit: (data: ExpenseInput) => Promise<void>;
  /** Quando definido, mostra um botão "Pular" (fluxo de confirmação em lote). */
  onSkip?: () => void;
}

/** Conta padrão para lançamentos sem conta definida (compra no cartão). */
function defaultAccountId(accounts: Account[]): string {
  return accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? '';
}

/**
 * Modal usado tanto para criar/editar lançamentos manuais quanto para
 * confirmar o preview vindo do chat (os dados chegam preenchidos em `initial`).
 */
export function ExpenseFormModal({
  categories,
  accounts,
  initial,
  title,
  progress,
  onCancel,
  onSubmit,
  onSkip,
}: Props) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(
    initial?.amount !== undefined ? String(initial.amount) : '',
  );
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? defaultAccountId(accounts),
  );
  const [recurring, setRecurring] = useState(initial?.recurring ?? false);
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
        categoryId: categoryId || null,
        accountId: accountId || null,
        recurring,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {title}
          {progress && <span className="modal-progress">{progress}</span>}
        </h2>

        {initial?.suggestedCategoryName && !categoryId && (
          <div className="alert alert-info">
            Categoria sugerida pela IA: <strong>{initial.suggestedCategoryName}</strong>{' '}
            (não cadastrada). Selecione uma existente ou deixe sem categoria.
          </div>
        )}

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
            <label className="field">
              <span>Categoria</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Conta</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            <span>Despesa recorrente</span>
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            {onSkip && (
              <button type="button" className="btn-ghost" onClick={onSkip} disabled={submitting}>
                Pular
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
