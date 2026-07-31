import { useState, type FormEvent } from 'react';
import type { Account, Category, Expense, ExpenseInput } from '../api/types';
import { ApiError } from '../api/client';
import { formatCurrency, todayIso } from '../utils/format';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';

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
  /** Quando definido, mostra um botão "Aceitar todos" (lança este e os demais do lote sem revisar um a um). */
  onAcceptAll?: () => Promise<void>;
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
  onAcceptAll,
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
  // Parcelamento só faz sentido ao criar; editar uma parcela existente mexe
  // só naquela parcela.
  const [installments, setInstallments] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const parcelas = Number(installments);
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 60) {
      setError('Parcelas deve ser um número inteiro entre 1 e 60.');
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
        ...(parcelas > 1 ? { installments: parcelas } : {}),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  /**
   * Prévia do parcelamento: mostra o valor da parcela e até quando vai, para
   * não haver dúvida se o valor digitado é o total ou o da parcela.
   */
  const parcelaPreview = (() => {
    const n = Number(installments);
    const total = Number(amount.replace(',', '.'));
    if (!Number.isInteger(n) || n <= 1 || !Number.isFinite(total) || total <= 0) return null;

    const centavos = Math.round(total * 100);
    const base = Math.floor(centavos / n);
    const resto = centavos - base * n;
    const primeira = (base + (resto > 0 ? 1 : 0)) / 100;
    const demais = base / 100;

    const [ano, mes, dia] = date.split('-').map(Number);
    const ultima = new Date(Date.UTC(ano, mes - 1 + (n - 1), 1));
    const mesFinal = ultima.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const valores =
      resto > 0
        ? `1ª de ${formatCurrency(primeira)} e ${n - 1} de ${formatCurrency(demais)}`
        : `${n}× de ${formatCurrency(demais)}`;

    return `${valores}, começando em ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} e terminando em ${mesFinal}. Total ${formatCurrency(total)}.`;
  })();

  async function handleAcceptAll() {
    if (!onAcceptAll) return;
    setError(null);
    setAcceptingAll(true);
    try {
      await onAcceptAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao lançar todos.');
      setAcceptingAll(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
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
            <div className="field">
              <span>Categoria</span>
              <Dropdown
                value={categoryId}
                onChange={setCategoryId}
                ariaLabel="Categoria"
                options={[
                  { value: '', label: 'Sem categoria' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="field">
              <span>Conta</span>
              <Dropdown
                value={accountId}
                onChange={setAccountId}
                ariaLabel="Conta"
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </div>
          </div>

          {/* Parcelamento só na criação — editar uma parcela mexe só nela. */}
          {!initial?.id && (
            <label className="field">
              <span>Parcelas</span>
              <input
                type="number"
                min={1}
                max={60}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </label>
          )}

          {parcelaPreview && (
            <div className="alert alert-info">
              {parcelaPreview}
            </div>
          )}

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
            <button type="button" className="btn-ghost" onClick={close} disabled={acceptingAll}>
              Cancelar
            </button>
            {onSkip && (
              <button type="button" className="btn-ghost" onClick={onSkip} disabled={submitting || acceptingAll}>
                Pular
              </button>
            )}
            {onAcceptAll && (
              <button
                type="button"
                className="btn-ghost"
                onClick={handleAcceptAll}
                disabled={submitting || acceptingAll}
              >
                {acceptingAll ? 'Lançando…' : 'Aceitar todos'}
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={submitting || acceptingAll}>
              {submitting ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
        </>
      )}
    </Modal>
  );
}
