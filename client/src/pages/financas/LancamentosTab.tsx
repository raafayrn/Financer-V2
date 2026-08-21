import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AccountKind } from '../../api/types';
import { BrandIcon } from '../../components/BrandIcon';
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

const WEEKDAY = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** ISO local (sem UTC) — "2026-08-14" não pode virar 13/08 por fuso. */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Cabeçalho do grupo: "Hoje" e "Ontem" ganham nome próprio; o resto vira
 * "Sexta, 14 de agosto". O ano fica de fora — o seletor de mês já diz qual é.
 */
function groupDate(iso: string): string {
  const date = parseIso(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  const [, m, d] = iso.split('-');
  return `${WEEKDAY[date.getDay()]}, ${Number(d)} de ${monthName(Number(m)).toLowerCase()}`;
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

  /**
   * Uma linha = descrição em cima, metadados embaixo (categoria · conta) e o
   * valor à direita. Antes eram cinco colunas disputando espaço; separar em
   * dois níveis deixa claro o que é o lançamento e o que é contexto.
   */
  function renderRow(item: LedgerItem) {
    if (item.kind === 'expense') {
      const e = item.data;
      const cat = e.categoryId ? categoryById.get(e.categoryId) : undefined;
      const color = cat?.color ?? 'var(--text-faint)';
      const acc = e.accountId ? accountById.get(e.accountId) : undefined;
      const badge = e.recurringExpenseId
        ? { label: 'Fixa', title: 'Lançada automaticamente pela despesa fixa' }
        : e.installmentGroupId
          ? {
              label: `Parcela ${e.installmentNo}/${e.installmentTotal}`,
              title: `Parcela ${e.installmentNo} de ${e.installmentTotal}`,
            }
          : e.recurring
            ? { label: 'Recorrente', title: 'Marcada como recorrente' }
            : null;

      return (
        <div key={`exp-${e.id}`} className="ms-ledger-row">
          <BrandIcon description={e.description} fallbackColor={cat?.color} size={32} />
          <span className="ms-ledger-main">
            <span className="ms-ledger-title">
              {e.description}
              {badge && (
                <span className="ms-ledger-badge" title={badge.title}>
                  {badge.label}
                </span>
              )}
            </span>
            <span className="ms-ledger-meta">
              <span style={{ color }}>{cat?.name ?? 'Sem categoria'}</span>
              <span className="ms-ledger-sep">·</span>
              {acc?.name ?? 'Sem conta'}
            </span>
          </span>
          <span className="ms-ledger-amount">−{formatCurrency(e.amount)}</span>
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
      <div key={`inc-${i.id}`} className="ms-ledger-row">
        <BrandIcon description={i.description} fallbackColor="var(--ok)" size={32} />
        <span className="ms-ledger-main">
          <span className="ms-ledger-title">{i.description}</span>
          <span className="ms-ledger-meta">
            <span style={{ color: 'var(--ok)' }}>Receita</span>
            <span className="ms-ledger-sep">·</span>
            {acc?.name ?? 'Sem conta'}
          </span>
        </span>
        <span className="ms-ledger-amount ms-pos">+{formatCurrency(i.amount)}</span>
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
              to="/financas/recorrentes"
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
            <div key={g.date} className="ms-ledger-group">
              <div className="ms-ledger-group-head">
                <span className="ms-ledger-group-date">{groupDate(g.date)}</span>
                <span className="ms-ledger-group-count">
                  {g.items.length} {g.items.length === 1 ? 'lançamento' : 'lançamentos'}
                </span>
                <span className={`ms-ledger-group-total${g.total >= 0 ? ' ms-pos' : ''}`}>
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
