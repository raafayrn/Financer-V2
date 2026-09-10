import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useConfirmIngestion,
  useDiscardIngestion,
  useIngestions,
  useUnmergeIngestion,
} from '../../api/queries';
import type { Ingestion } from '../../api/types';
import { BrandIcon } from '../../components/BrandIcon';
import { ExpenseFormModal } from '../../components/ExpenseFormModal';
import { formatCurrency } from '../../utils/format';
import { useFinancas } from './context';

/**
 * Fila do que chegou sozinho — pelo e-mail do banco ou pelo atalho do iPhone.
 *
 * Nada aqui conta no mês. O número do dashboard só se mexe quando você
 * confirma uma linha, e é isso que separa "o banco me avisou" de "eu gastei".
 */

const SOURCE_LABEL: Record<Ingestion['source'], string> = {
  email: 'E-mail',
  wallet_shortcut: 'Atalho',
  'email+shortcut': 'E-mail + atalho',
};

const TYPE_LABEL: Record<Ingestion['transactionType'], string> = {
  credit_purchase: 'Compra no crédito',
  pix_out: 'Pix enviado',
  pix_in: 'Pix recebido',
  transfer: 'Transferência',
  payment: 'Pagamento',
  unknown: 'Não identificado',
};

/** "26/08 às 18:06" — a hora da compra é o que importa para reconhecer o gasto. */
function formatMoment(iso: string | null): string {
  if (!iso) return 'sem data';
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

/** Só o que dá para confirmar sem você olhar: leitura confiável e valor lido. */
function isHighConfidence(i: Ingestion): boolean {
  return i.parseConfidence === 'high' && i.amount !== null && i.transactionType !== 'unknown';
}

export function PendentesTab() {
  const { categories, accounts, categoryById } = useFinancas();
  const pendentes = useIngestions('pending');
  // Confirmar/descartar/desfazer invalidam ['ingestions'] E o mês inteiro
  // (gastos, receitas, resumo) — ver afterIngestionChange em api/queries.ts.
  const confirmIngestion = useConfirmIngestion();
  const discardIngestion = useDiscardIngestion();
  const unmergeIngestion = useUnmergeIngestion();

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ingestion | null>(null);

  const items = pendentes.data ?? [];

  function reportError(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function confirm(item: Ingestion) {
    setBusyId(item.id);
    setError(null);
    try {
      await confirmIngestion.mutateAsync({ id: item.id });
    } catch (err) {
      reportError(err, 'Erro ao confirmar.');
    } finally {
      setBusyId(null);
    }
  }

  async function discard(item: Ingestion) {
    setBusyId(item.id);
    setError(null);
    try {
      await discardIngestion.mutateAsync(item.id);
    } catch (err) {
      reportError(err, 'Erro ao descartar.');
    } finally {
      setBusyId(null);
    }
  }

  async function unmerge(item: Ingestion) {
    setBusyId(item.id);
    setError(null);
    try {
      await unmergeIngestion.mutateAsync(item.id);
    } catch (err) {
      reportError(err, 'Erro ao desfazer a fusão.');
    } finally {
      setBusyId(null);
    }
  }

  /** Lote: só os que não pedem revisão. O resto continua esperando você. */
  async function confirmAllHighConfidence() {
    const alvos = items.filter(isHighConfidence);
    if (alvos.length === 0) return;
    setBusyId('lote');
    setError(null);
    try {
      for (const item of alvos) {
        await confirmIngestion.mutateAsync({ id: item.id });
      }
    } catch (err) {
      reportError(err, 'Erro ao confirmar em lote.');
    } finally {
      setBusyId(null);
    }
  }

  const highConfidenceCount = items.filter(isHighConfidence).length;

  if (pendentes.isPending) {
    return (
      <div className="center-pad">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="ms-stack">
      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Esperando confirmação</h3>
            <span className="ms-muted">
              {items.length === 0
                ? 'Nada na fila'
                : `${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'} — nenhum conta no mês ainda`}
            </span>
          </div>
          {highConfidenceCount > 0 && (
            <div className="ms-card-actions">
              <button
                className="ms-btn"
                onClick={() => void confirmAllHighConfidence()}
                disabled={busyId !== null}
              >
                {busyId === 'lote'
                  ? 'Confirmando…'
                  : `Confirmar ${highConfidenceCount} de alta confiança`}
              </button>
            </div>
          )}
        </div>

        {(error || pendentes.error) && (
          <div className="alert alert-error">
            {error ??
              (pendentes.error instanceof ApiError
                ? pendentes.error.message
                : 'Erro ao carregar pendentes.')}
          </div>
        )}

        {items.length === 0 ? (
          <p className="empty">
            Nada esperando. O que o banco avisar ou você registrar pelo atalho do iPhone aparece
            aqui antes de entrar na conta do mês.
          </p>
        ) : (
          items.map((item) => {
            const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
            const precisaOlhar = item.parseConfidence === 'low' || item.amount === null;
            return (
              <div key={item.id} className="ms-pending-row">
                <BrandIcon description={item.merchant} fallbackColor={cat?.color} />

                <div className="ms-pending-main">
                  <span className="ms-pending-name">{item.merchant}</span>
                  <span className="ms-pending-meta">
                    {formatMoment(item.occurredAt)} · {TYPE_LABEL[item.transactionType]}
                    {cat ? ` · ${cat.name}` : item.suggestedCategory ? ` · ${item.suggestedCategory}?` : ''}
                  </span>
                  <span className="ms-pending-badges">
                    {/* E-mail + atalho é o mais confiável da fila: o valor veio
                        do banco e a hora bateu com a do pagamento. */}
                    <span
                      className={`ms-badge${item.source === 'email+shortcut' ? ' ms-badge-strong' : ''}`}
                    >
                      {SOURCE_LABEL[item.source]}
                    </span>
                    {precisaOlhar && (
                      <span className="ms-badge ms-badge-warn">
                        {item.amount === null ? 'Sem valor — revise' : 'Leitura incerta'}
                      </span>
                    )}
                    {item.mergedFrom.length > 0 && (
                      <button
                        className="ms-badge ms-badge-link"
                        onClick={() => void unmerge(item)}
                        disabled={busyId !== null}
                        title="Eram duas compras diferentes? Devolve a outra para a fila."
                      >
                        Desfazer fusão
                      </button>
                    )}
                  </span>
                </div>

                <div className="ms-pending-right">
                  <span className={`ms-pending-amount${item.amount === null ? ' ms-muted' : ''}`}>
                    {item.amount === null ? '—' : formatCurrency(item.amount)}
                  </span>
                  <div className="ms-pending-actions">
                    <button
                      className="ms-btn ms-btn-ghost"
                      onClick={() => setEditing(item)}
                      disabled={busyId !== null}
                    >
                      Editar
                    </button>
                    <button
                      className="ms-btn ms-btn-ghost"
                      onClick={() => void discard(item)}
                      disabled={busyId !== null}
                    >
                      Descartar
                    </button>
                    <button
                      className="ms-btn"
                      onClick={() => (item.amount === null ? setEditing(item) : void confirm(item))}
                      disabled={busyId !== null}
                    >
                      {busyId === item.id ? '…' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* O mesmo formulário do lançamento manual: corrigir um pendente e
          digitar um gasto são a mesma tarefa, com os campos já preenchidos. */}
      {editing && (
        <ExpenseFormModal
          title="Confirmar lançamento"
          categories={categories}
          accounts={accounts}
          initial={{
            description: editing.merchant,
            amount: editing.amount ?? undefined,
            date: (editing.occurredAt ?? editing.receivedAt).slice(0, 10),
            categoryId: editing.categoryId,
            suggestedCategoryName: editing.suggestedCategory,
          }}
          onCancel={() => setEditing(null)}
          onSubmit={async (data) => {
            await confirmIngestion.mutateAsync({
              id: editing.id,
              data: {
                amount: data.amount,
                description: data.description,
                categoryId: data.categoryId,
                accountId: data.accountId,
                date: data.date,
              },
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
