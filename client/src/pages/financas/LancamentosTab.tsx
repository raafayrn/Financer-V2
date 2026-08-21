import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AccountKind } from '../../api/types';
import { Dropdown } from '../../components/Dropdown';
import { EditIcon, FilterIcon, RepeatIcon, TrashIcon } from '../../components/icons';
import { springSheet } from '../../lib/motion';
import { formatCurrency, monthName } from '../../utils/format';
import { useFinancas } from './context';
import type { FinancasCtx } from './context';

type SortMode = 'date-desc' | 'amount-desc' | 'amount-asc';
type TypeFilter = 'all' | AccountKind;

const TYPE_FILTER_LABEL: Record<AccountKind, string> = {
  FOOD_VOUCHER: 'VR',
  WALLET: 'Pix',
  CREDIT_CARD: 'Crédito',
};

type LedgerItem =
  | { kind: 'expense'; data: FinancasCtx['expenses'][number] }
  | { kind: 'income'; data: FinancasCtx['incomes'][number] };

/** "2026-08-18" → "18 de agosto de 2026" (cabeçalho de grupo da lista). */
function fullDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} de ${monthName(Number(m)).toLowerCase()} de ${y}`;
}

export function LancamentosTab() {
  const {
    expenses,
    incomes,
    categories,
    categoryById,
    accountById,
    openModal,
    deleteExpense,
    deleteIncome,
  } = useFinancas();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');

  const ledger: LedgerItem[] = [
    ...expenses.map((data): LedgerItem => ({ kind: 'expense', data })),
    ...incomes.map((data): LedgerItem => ({ kind: 'income', data })),
  ].sort((a, b) => (a.data.date < b.data.date ? 1 : a.data.date > b.data.date ? -1 : 0));

  const filtersActive =
    categoryFilter !== 'all' || typeFilter !== 'all' || recurringOnly || sortMode !== 'date-desc';

  function resetFilters() {
    setCategoryFilter('all');
    setTypeFilter('all');
    setRecurringOnly(false);
    setSortMode('date-desc');
  }

  let filtered = ledger.filter((item) => {
    if (
      categoryFilter !== 'all' &&
      (item.kind !== 'expense' || item.data.categoryId !== categoryFilter)
    ) {
      return false;
    }
    if (typeFilter !== 'all') {
      const acc = item.data.accountId ? accountById.get(item.data.accountId) : undefined;
      if (acc?.kind !== typeFilter) return false;
    }
    if (recurringOnly && (item.kind !== 'expense' || !item.data.recurring)) return false;
    return true;
  });

  if (sortMode === 'amount-desc') {
    filtered = [...filtered].sort((a, b) => b.data.amount - a.data.amount);
  } else if (sortMode === 'amount-asc') {
    filtered = [...filtered].sort((a, b) => a.data.amount - b.data.amount);
  }

  // Só agrupa por data quando a ordem é cronológica — ordenado por valor, um
  // cabeçalho de data por linha não diria nada.
  const grouped = sortMode === 'date-desc';
  const groups: { date: string; items: LedgerItem[]; total: number }[] = [];
  if (grouped) {
    for (const item of filtered) {
      const last = groups[groups.length - 1];
      const signed = item.kind === 'expense' ? -item.data.amount : item.data.amount;
      if (last && last.date === item.data.date) {
        last.items.push(item);
        last.total += signed;
      } else {
        groups.push({ date: item.data.date, items: [item], total: signed });
      }
    }
  }

  const spentItems = filtered.filter((i) => i.kind === 'expense');
  const spentTotal = spentItems.reduce((acc, i) => acc + i.data.amount, 0);
  const largest = filtered.reduce((acc, i) => Math.max(acc, i.data.amount), 0);
  // Média só das despesas — misturar receitas na conta distorceria o valor.
  const average = spentItems.length > 0 ? spentTotal / spentItems.length : 0;

  function renderRow(item: LedgerItem) {
    if (item.kind === 'expense') {
      const e = item.data;
      const cat = e.categoryId ? categoryById.get(e.categoryId) : undefined;
      const acc = e.accountId ? accountById.get(e.accountId) : undefined;
      return (
        <div key={`exp-${e.id}`} className="ms-row">
          <span
            className="ms-row-avatar"
            style={{ background: `${cat?.color ?? '#94a3b8'}22`, color: cat?.color ?? '#64748b' }}
          >
            {e.description.slice(0, 1).toUpperCase()}
          </span>
          <span className="ms-row-name">
            {e.description}
            {e.recurringExpenseId ? (
              <span className="tag tag-auto" title="Lançada automaticamente pela despesa fixa">
                fixa
              </span>
            ) : e.installmentGroupId ? (
              <span className="tag tag-installment" title={`Parcela ${e.installmentNo} de ${e.installmentTotal}`}>
                {e.installmentNo}/{e.installmentTotal}
              </span>
            ) : (
              e.recurring && <span className="tag">recorrente</span>
            )}
          </span>
          <span className="ms-chip">
            <span className="ms-legend-dot" style={{ margin: 0, background: cat?.color ?? '#94a3b8' }} />
            {cat?.name ?? 'Sem categoria'}
          </span>
          <span className="ms-row-meta ms-row-account">{acc?.name ?? 'Sem conta'}</span>
          <span className="ms-row-amount">−{formatCurrency(e.amount)}</span>
          <span className="ms-row-actions">
            <button className="ms-icon-btn" title="Editar" onClick={() => openModal({ kind: 'edit', expense: e })}>
              <EditIcon />
            </button>
            <button className="ms-icon-btn" title="Excluir" onClick={() => void deleteExpense(e.id)}>
              <TrashIcon />
            </button>
          </span>
        </div>
      );
    }

    const i = item.data;
    const acc = i.accountId ? accountById.get(i.accountId) : undefined;
    return (
      <div key={`inc-${i.id}`} className="ms-row">
        <span
          className="ms-row-avatar"
          style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}
        >
          {i.description.slice(0, 1).toUpperCase()}
        </span>
        <span className="ms-row-name">{i.description}</span>
        <span className="ms-chip">
          <span className="ms-legend-dot" style={{ margin: 0, background: 'var(--ok)' }} />
          Receita
        </span>
        <span className="ms-row-meta ms-row-account">{acc?.name ?? 'Sem conta'}</span>
        <span className="ms-row-amount ms-pos">+{formatCurrency(i.amount)}</span>
        <span className="ms-row-actions">
          <button
            className="ms-icon-btn"
            title="Editar"
            onClick={() => openModal({ kind: 'edit-income', income: i })}
          >
            <EditIcon />
          </button>
          <button className="ms-icon-btn" title="Excluir" onClick={() => void deleteIncome(i.id)}>
            <TrashIcon />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="ms-grid-main-side">
      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Lançamentos</h3>
          <span className="ms-muted">{filtered.length}</span>
          <div className="ms-card-actions">
            <Link
              className="ms-btn"
              to="/recorrentes"
              title="Despesas fixas (lançadas automaticamente todo mês)"
            >
              <RepeatIcon />
              Fixas
            </Link>
            <button
              className={`ms-btn${filtersActive ? ' ms-btn-on' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <FilterIcon />
              Filtros
            </button>
            <button className="ms-btn ms-btn-primary" onClick={() => openModal({ kind: 'create' })}>
              + Novo
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              className="ms-filters"
              style={{ overflow: 'hidden' }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={springSheet}
            >
              <div className="ms-filter-row">
                <span className="ms-label">Categoria</span>
                <Dropdown
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  ariaLabel="Categoria"
                  options={[
                    { value: 'all', label: 'Todas' },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>

              <div className="ms-filter-row">
                <span className="ms-label">Tipo</span>
                <div className="ms-segment">
                  <button
                    className={`ms-segment-item${typeFilter === 'all' ? ' active' : ''}`}
                    onClick={() => setTypeFilter('all')}
                  >
                    <span>Todos</span>
                  </button>
                  {(['FOOD_VOUCHER', 'WALLET', 'CREDIT_CARD'] as AccountKind[]).map((kind) => (
                    <button
                      key={kind}
                      className={`ms-segment-item${typeFilter === kind ? ' active' : ''}`}
                      onClick={() => setTypeFilter(kind)}
                    >
                      <span>{TYPE_FILTER_LABEL[kind]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ms-filter-row">
                <span className="ms-label">Ordenar por</span>
                <div className="ms-segment">
                  <button
                    className={`ms-segment-item${sortMode === 'date-desc' ? ' active' : ''}`}
                    onClick={() => setSortMode('date-desc')}
                  >
                    <span>Mais recentes</span>
                  </button>
                  <button
                    className={`ms-segment-item${sortMode === 'amount-desc' ? ' active' : ''}`}
                    onClick={() => setSortMode('amount-desc')}
                  >
                    <span>Valor ↓</span>
                  </button>
                  <button
                    className={`ms-segment-item${sortMode === 'amount-asc' ? ' active' : ''}`}
                    onClick={() => setSortMode('amount-asc')}
                  >
                    <span>Valor ↑</span>
                  </button>
                </div>
              </div>

              <div className="ms-filter-row">
                <span className="ms-label">Somente recorrentes</span>
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={recurringOnly}
                    onChange={(e) => setRecurringOnly(e.target.checked)}
                  />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                </span>
              </div>

              {filtersActive && (
                <button className="ms-btn ms-btn-ghost" onClick={resetFilters}>
                  Limpar filtros
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.length === 0 ? (
          <p className="empty">
            {ledger.length === 0
              ? 'Nenhum lançamento neste mês.'
              : 'Nenhum lançamento com esses filtros.'}
          </p>
        ) : grouped ? (
          groups.map((g) => (
            <div key={g.date}>
              <div className="ms-row-group">
                <span>{fullDate(g.date)}</span>
                <span>
                  {g.total >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(g.total))}
                </span>
              </div>
              {g.items.map(renderRow)}
            </div>
          ))
        ) : (
          <>{filtered.map(renderRow)}</>
        )}
      </section>

      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Resumo</h3>
        </div>
        <div className="ms-card-body">
          <dl className="ms-summary">
            <div className="ms-summary-row">
              <dt>Total de lançamentos</dt>
              <dd>{filtered.length}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Maior lançamento</dt>
              <dd>{formatCurrency(largest)}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Lançamento médio</dt>
              <dd>{formatCurrency(average)}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Total gasto</dt>
              <dd>{formatCurrency(spentTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
