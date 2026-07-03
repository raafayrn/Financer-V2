import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Account, Category, ChatPreview, Expense, ExpenseInput, IncomeInput, Summary } from '../api/types';
import { useMonth } from '../context/MonthContext';
import { MonthNavigator } from '../components/MonthNavigator';
import { ProgressBar } from '../components/ProgressBar';
import { ChatBox } from '../components/ChatBox';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { IncomeFormModal } from '../components/IncomeFormModal';
import { formatCurrency, formatDayMonth } from '../utils/format';

const STATUS_MESSAGE: Record<Summary['status'], string> = {
  ok: 'Dentro do orçamento',
  warning: 'Atenção: perto do limite',
  over: 'Você passou do orçamento',
};

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; expense: Expense }
  | { kind: 'chat'; preview: ChatPreview }
  | { kind: 'chat-batch'; previews: ChatPreview[]; index: number }
  | { kind: 'income' };

export function DashboardPage() {
  const { year, month } = useMonth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e, c, a] = await Promise.all([
        api.getSummary(year, month),
        api.listExpenses(year, month),
        api.listCategories(),
        api.listAccounts(),
      ]);
      setSummary(s);
      setExpenses(e);
      setCategories(c);
      setAccounts(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  async function handleCreate(data: ExpenseInput) {
    await api.createExpense(data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleEdit(id: string, data: ExpenseInput) {
    await api.updateExpense(id, data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleDelete(id: string) {
    if (!confirm('Excluir este lançamento?')) return;
    await api.deleteExpense(id);
    await load();
  }
  async function handleCreateIncome(data: IncomeInput) {
    await api.createIncome(data);
    setModal({ kind: 'closed' });
    await load();
  }

  // Fluxo de confirmação em lote (vários lançamentos extraídos de uma foto).
  async function handleBatchSubmit(data: ExpenseInput) {
    if (modal.kind !== 'chat-batch') return;
    await api.createExpense(data);
    advanceBatch();
  }
  function advanceBatch() {
    if (modal.kind !== 'chat-batch') return;
    const nextIndex = modal.index + 1;
    if (nextIndex >= modal.previews.length) {
      setModal({ kind: 'closed' });
      void load();
    } else {
      setModal({ kind: 'chat-batch', previews: modal.previews, index: nextIndex });
    }
  }

  return (
    <div className="page">
      <MonthNavigator />

      {loading && !summary ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : summary ? (
        <>
          <div className="overview-grid">
            {/* Destaque principal: quanto ainda posso gastar (baseado no orçamento) */}
            <section className={`hero card status-${summary.status}`}>
              <span className="hero-label">Ainda posso gastar</span>
              <span className="hero-value">{formatCurrency(summary.remaining)}</span>
              <span className="hero-status">{STATUS_MESSAGE[summary.status]}</span>

              <ProgressBar percent={summary.percentUsed} status={summary.status} />

              <div className="hero-details">
                <div>
                  <span className="detail-label">Orçamento</span>
                  <span className="detail-value">{formatCurrency(summary.budget)}</span>
                </div>
                <div>
                  <span className="detail-label">Gasto</span>
                  <span className="detail-value">{formatCurrency(summary.totalSpent)}</span>
                </div>
                <div>
                  <span className="detail-label">Usado</span>
                  <span className="detail-value">
                    {summary.budget > 0 ? `${Math.round(summary.percentUsed * 100)}%` : '—'}
                  </span>
                </div>
              </div>
            </section>

            {/* Renda do mês */}
            <div className="stat-card overview-item">
              <span className="stat-label">Renda do mês</span>
              <span className="stat-value">{formatCurrency(summary.income.total)}</span>
              <span className="stat-sub">
                Salário {formatCurrency(summary.income.salary)}
                {summary.income.extra > 0 && <> + outros {formatCurrency(summary.income.extra)}</>}
              </span>
              <button
                className="btn-ghost btn-sm income-add-btn"
                onClick={() => setModal({ kind: 'income' })}
              >
                + Renda avulsa
              </button>
            </div>

            {/* Sobra do mês */}
            <div className="stat-card overview-item">
              <span className="stat-label">Sobra do mês</span>
              <span
                className="stat-value"
                style={{ color: summary.monthSurplus >= 0 ? 'var(--ok)' : 'var(--over)' }}
              >
                {formatCurrency(summary.monthSurplus)}
              </span>
              <span className="stat-sub">Renda − gasto total (todas as contas)</span>
            </div>

            {/* Gasto por conta de origem */}
            <section className="card overview-item">
              <h3 className="section-title">Gasto até agora</h3>
              <ul className="account-breakdown">
                <li>
                  <span>Fixos (cartão)</span>
                  <span>{formatCurrency(summary.accounts.fixed)}</span>
                </li>
                <li>
                  <span>Variáveis (cartão)</span>
                  <span>{formatCurrency(summary.accounts.variable)}</span>
                </li>
                <li>
                  <span>Vale-alimentação</span>
                  <span>{formatCurrency(summary.accounts.foodVoucher)}</span>
                </li>
                <li>
                  <span>Carteira (Pix)</span>
                  <span>{formatCurrency(summary.accounts.wallet)}</span>
                </li>
                <li className="account-breakdown-total">
                  <span>Total</span>
                  <span>{formatCurrency(summary.accounts.total)}</span>
                </li>
              </ul>
            </section>

            {/* Saldo acumulado da carteira */}
            <div className="stat-card overview-item wallet-card">
              <span className="stat-label">Saldo na carteira (Pix)</span>
              <span className="stat-value">{formatCurrency(summary.walletBalance)}</span>
              <span className="stat-sub">Acumula entre os meses — não reseta.</span>
            </div>
          </div>

          {summary.budget === 0 && (
            <div className="alert alert-info">
              Nenhum orçamento definido para este mês. Defina em <strong>Ajustes</strong>.
            </div>
          )}

          {/* Assistente: lançar por texto/foto ou perguntar sobre os gastos */}
          <ChatBox
            onPreview={(preview) => setModal({ kind: 'chat', preview })}
            onPreviews={(previews) => setModal({ kind: 'chat-batch', previews, index: 0 })}
          />

          <div className="dash-columns">
            {/* Gasto por categoria */}
            {summary.byCategory.length > 0 && (
              <section className="card">
                <h3 className="section-title">Gasto por categoria</h3>
                <ul className="cat-list">
                  {summary.byCategory.map((c) => {
                    const pct =
                      summary.totalSpent > 0 ? (c.spent / summary.totalSpent) * 100 : 0;
                    return (
                      <li key={c.categoryId ?? 'none'} className="cat-row">
                        <div className="cat-head">
                          <span className="cat-dot" style={{ background: c.color }} />
                          <span className="cat-name">{c.categoryName}</span>
                          <span className="cat-value">{formatCurrency(c.spent)}</span>
                        </div>
                        <div className="cat-bar">
                          <div
                            className="cat-bar-fill"
                            style={{ width: `${pct}%`, background: c.color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Lista de lançamentos */}
            <section className="card">
              <div className="section-head">
                <h3 className="section-title">Lançamentos ({expenses.length})</h3>
                <button className="btn-primary btn-sm" onClick={() => setModal({ kind: 'create' })}>
                  + Novo
                </button>
              </div>

              {expenses.length === 0 ? (
                <p className="empty">Nenhum lançamento neste mês.</p>
              ) : (
                <ul className="exp-list">
                  {expenses.map((e) => {
                    const cat = e.categoryId ? categoryById.get(e.categoryId) : undefined;
                    return (
                      <li key={e.id} className="exp-row">
                        <span
                          className="exp-dot"
                          style={{ background: cat?.color ?? '#94a3b8' }}
                        />
                        <div className="exp-main">
                          <span className="exp-desc">
                            {e.description}
                            {e.recurring && <span className="tag">recorrente</span>}
                          </span>
                          <span className="exp-meta">
                            {formatDayMonth(e.date)} · {cat?.name ?? 'Sem categoria'}
                          </span>
                        </div>
                        <span className="exp-amount">{formatCurrency(e.amount)}</span>
                        <div className="exp-actions">
                          <button
                            className="icon-btn"
                            title="Editar"
                            onClick={() => setModal({ kind: 'edit', expense: e })}
                          >
                            ✎
                          </button>
                          <button
                            className="icon-btn"
                            title="Excluir"
                            onClick={() => handleDelete(e.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}

      {/* Modais */}
      {modal.kind === 'create' && (
        <ExpenseFormModal
          title="Novo lançamento"
          categories={categories}
          accounts={accounts}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreate}
        />
      )}
      {modal.kind === 'edit' && (
        <ExpenseFormModal
          title="Editar lançamento"
          categories={categories}
          accounts={accounts}
          initial={modal.expense}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={(data) => handleEdit(modal.expense.id, data)}
        />
      )}
      {modal.kind === 'chat' && (
        <ExpenseFormModal
          title="Confirmar lançamento"
          categories={categories}
          accounts={accounts}
          initial={modal.preview}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreate}
        />
      )}
      {modal.kind === 'chat-batch' && (
        <ExpenseFormModal
          key={modal.index}
          title="Confirmar lançamento"
          progress={`${modal.index + 1} de ${modal.previews.length}`}
          categories={categories}
          accounts={accounts}
          initial={modal.previews[modal.index]}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleBatchSubmit}
          onSkip={advanceBatch}
        />
      )}
      {modal.kind === 'income' && (
        <IncomeFormModal
          title="Nova renda"
          accounts={accounts}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreateIncome}
        />
      )}
    </div>
  );
}
