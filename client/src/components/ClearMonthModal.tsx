import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import type { Category, Expense, Income } from '../api/types';
import { formatCurrency, monthName } from '../utils/format';
import { Modal } from './Modal';

type Preset = 'all' | 'expenses' | 'incomes' | 'variable';

interface Row {
  key: string;
  kind: 'expense' | 'income';
  id: string;
  description: string;
  date: string;
  amount: number;
  /** Veio de um template de despesa fixa (não foi digitado à mão). */
  fixed: boolean;
  badge: string | null;
  meta: string;
}

interface Props {
  year: number;
  month: number;
  expenses: Expense[];
  incomes: Income[];
  categoryById: Map<string, Category>;
  onCancel: () => void;
  onConfirm: (expenseIds: string[], incomeIds: string[]) => Promise<void>;
}

/** "2026-08-14" -> "14/08" */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * Limpeza dos lançamentos do mês. A lista vem inteira, com tudo marcado menos
 * os gastos fixos — apagar um fixo é uma decisão diferente das outras: ele
 * volta todo mês sozinho, então sumiria do mês sem ninguém ter pedido.
 *
 * A confirmação é em dois toques dentro do próprio modal (o botão vira
 * "Confirmar") porque a exclusão não tem desfazer.
 */
export function ClearMonthModal({
  year,
  month,
  expenses,
  incomes,
  categoryById,
  onCancel,
  onConfirm,
}: Props) {
  const rows = useMemo<Row[]>(() => {
    const fromExpenses = expenses.map((e): Row => {
      const cat = e.categoryId ? categoryById.get(e.categoryId) : undefined;
      return {
        key: `exp-${e.id}`,
        kind: 'expense',
        id: e.id,
        description: e.description,
        date: e.date,
        amount: e.amount,
        fixed: Boolean(e.recurringExpenseId),
        badge: e.recurringExpenseId
          ? 'Fixa'
          : e.installmentGroupId
            ? `Parcela ${e.installmentNo}/${e.installmentTotal}`
            : null,
        meta: cat?.name ?? 'Sem categoria',
      };
    });
    const fromIncomes = incomes.map(
      (i): Row => ({
        key: `inc-${i.id}`,
        kind: 'income',
        id: i.id,
        description: i.description,
        date: i.date,
        amount: i.amount,
        fixed: false,
        badge: null,
        meta: 'Receita',
      }),
    );
    return [...fromExpenses, ...fromIncomes].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [expenses, incomes, categoryById]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.fixed).map((r) => r.key)),
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(preset: Preset) {
    setConfirming(false);
    const match = (r: Row) =>
      preset === 'all' ||
      (preset === 'expenses' && r.kind === 'expense') ||
      (preset === 'incomes' && r.kind === 'income') ||
      (preset === 'variable' && r.kind === 'expense' && !r.fixed);
    setSelected(new Set(rows.filter(match).map((r) => r.key)));
  }

  function toggle(key: string) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosen = rows.filter((r) => selected.has(r.key));
  const expenseIds = chosen.filter((r) => r.kind === 'expense').map((r) => r.id);
  const incomeIds = chosen.filter((r) => r.kind === 'income').map((r) => r.id);
  const fixedCount = chosen.filter((r) => r.fixed).length;

  async function handleConfirm(close: () => void) {
    if (chosen.length === 0) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(expenseIds, incomeIds);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao limpar os lançamentos.');
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">
            Limpar lançamentos de {monthName(month).toLowerCase()} de {year}
          </h2>

          {rows.length === 0 ? (
            <>
              <p className="hint">Não há nada lançado neste mês.</p>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={close}>
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="clear-presets">
                <button type="button" className="ms-btn" onClick={() => applyPreset('all')}>
                  Tudo
                </button>
                <button type="button" className="ms-btn" onClick={() => applyPreset('variable')}>
                  Só variáveis
                </button>
                <button type="button" className="ms-btn" onClick={() => applyPreset('expenses')}>
                  Só gastos
                </button>
                <button type="button" className="ms-btn" onClick={() => applyPreset('incomes')}>
                  Só receitas
                </button>
                <button type="button" className="ms-btn" onClick={() => setSelected(new Set())}>
                  Nenhum
                </button>
              </div>

              <div className="clear-list">
                {rows.map((r) => (
                  <label key={r.key} className="clear-row">
                    <input
                      type="checkbox"
                      checked={selected.has(r.key)}
                      onChange={() => toggle(r.key)}
                    />
                    <span className="clear-row-main">
                      <span className="clear-row-title">
                        {r.description}
                        {r.badge && <span className="ms-ledger-badge">{r.badge}</span>}
                      </span>
                      <span className="clear-row-meta">
                        {shortDate(r.date)} · {r.meta}
                      </span>
                    </span>
                    <span className={`clear-row-amount${r.kind === 'income' ? ' ms-pos' : ''}`}>
                      {r.kind === 'income' ? '+' : '−'}
                      {formatCurrency(r.amount)}
                    </span>
                  </label>
                ))}
              </div>

              {fixedCount > 0 && (
                <p className="hint">
                  {fixedCount === 1
                    ? 'Um gasto fixo será apagado'
                    : `${fixedCount} gastos fixos serão apagados`}{' '}
                  deste mês e não voltam sozinhos. O template continua valendo para os outros meses.
                </p>
              )}

              {error && <div className="alert alert-error">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={close}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={chosen.length === 0 || submitting}
                  onClick={() => void handleConfirm(close)}
                >
                  {submitting
                    ? 'Limpando…'
                    : confirming
                      ? `Confirmar exclusão de ${chosen.length}`
                      : `Limpar ${chosen.length} ${chosen.length === 1 ? 'lançamento' : 'lançamentos'}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
