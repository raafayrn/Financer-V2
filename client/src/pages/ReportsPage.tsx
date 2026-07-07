import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ReportsOverview } from '../api/types';
import { formatCurrency, formatDayMonth, monthShort } from '../utils/format';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import { springSmooth } from '../lib/motion';

const overviewContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

export function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getReportsOverview(year)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [year]);

  const maxValue = overview
    ? Math.max(1, ...overview.months.map((m) => Math.max(m.spent, m.budget, m.income)))
    : 1;

  const savingsPct = overview ? Math.round(overview.totals.savingsRate * 100) : 0;

  return (
    <div className="page">
      <h2 className="page-title">Relatórios</h2>

      <div className="year-nav">
        <button className="month-arrow" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
          <ChevronLeftIcon />
        </button>
        <span className="month-label">{year}</span>
        <button className="month-arrow" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
          <ChevronRightIcon />
        </button>
      </div>

      {loading ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : overview ? (
        <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
          {/* Estatísticas gerais do ano */}
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Gasto no ano</span>
            <span className="stat-value">{formatCurrency(overview.totals.spentYear)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Renda no ano</span>
            <span className="stat-value">{formatCurrency(overview.totals.incomeYear)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Taxa de economia</span>
            <span
              className="stat-value"
              style={{ color: savingsPct >= 0 ? 'var(--ok)' : 'var(--over)' }}
            >
              {savingsPct}%
            </span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Gasto médio mensal</span>
            <span className="stat-value">{formatCurrency(overview.totals.avgMonthlySpent)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Fixos/recorrentes (média)</span>
            <span className="stat-value">{formatCurrency(overview.totals.recurringMonthlyAvg)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Meses acima do orçamento</span>
            <span className="stat-value">{overview.totals.monthsOverBudget}</span>
          </motion.div>

          {/* Gasto x Orçamento x Renda por mês */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <div className="section-head">
              <h3 className="section-title">Gasto, renda e orçamento por mês</h3>
              <span className="hint">{overview.totals.expenseCount} lançamentos no ano</span>
            </div>

            <div className="chart">
              {overview.months.map((m) => {
                const spentH = (m.spent / maxValue) * 100;
                const budgetH = (m.budget / maxValue) * 100;
                const incomeH = (m.income / maxValue) * 100;
                const over = m.budget > 0 && m.spent > m.budget;
                return (
                  <div
                    key={m.month}
                    className="chart-col"
                    title={`${monthShort(m.month)}: gasto ${formatCurrency(m.spent)}, renda ${formatCurrency(m.income)}`}
                  >
                    <div className="chart-bars">
                      {m.budget > 0 && (
                        <div
                          className="chart-budget"
                          style={{ height: `${budgetH}%` }}
                          title={`Orçamento: ${formatCurrency(m.budget)}`}
                        />
                      )}
                      <div className={`chart-spent ${over ? 'over' : ''}`} style={{ height: `${spentH}%` }} />
                      <div className="chart-income" style={{ height: `${incomeH}%` }} />
                    </div>
                    <span className="chart-label">{monthShort(m.month)}</span>
                  </div>
                );
              })}
            </div>

            <div className="chart-legend">
              <span>
                <i className="legend-box spent" /> Gasto
              </span>
              <span>
                <i className="legend-box income" /> Renda
              </span>
              <span>
                <i className="legend-box budget" /> Orçamento
              </span>
            </div>
          </motion.section>

          {/* Gasto por categoria no ano */}
          {overview.byCategory.length > 0 && (
            <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
              <h3 className="section-title">Gasto por categoria no ano</h3>
              <ul className="cat-list">
                {overview.byCategory.map((c) => (
                  <li key={c.categoryId ?? 'none'} className="cat-row">
                    <div className="cat-head">
                      <span className="cat-dot" style={{ background: c.color }} />
                      <span className="cat-name">{c.categoryName}</span>
                      <span className="cat-value">{formatCurrency(c.spent)}</span>
                    </div>
                    <div className="cat-bar">
                      <div
                        className="cat-bar-fill"
                        style={{ width: `${c.percent * 100}%`, background: c.color }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Maiores despesas do ano */}
          {overview.topExpenses.length > 0 && (
            <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
              <h3 className="section-title">Maiores despesas do ano</h3>
              <ul className="exp-list">
                {overview.topExpenses.map((e) => (
                  <li key={e.id} className="exp-row">
                    <span className="exp-dot" style={{ background: '#94a3b8' }} />
                    <div className="exp-main">
                      <span className="exp-desc">{e.description}</span>
                      <span className="exp-meta">
                        {formatDayMonth(e.date)} · {e.categoryName}
                      </span>
                    </div>
                    <span className="exp-amount exp-amount-neg">−{formatCurrency(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}
