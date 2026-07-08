import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Investment, InvestmentInput, InvestmentSummary } from '../api/types';
import { formatCurrency, formatDayMonth, monthShort } from '../utils/format';
import { INVESTMENT_TYPE_COLOR, INVESTMENT_TYPE_LABEL } from '../utils/investments';
import { ChevronLeftIcon, ChevronRightIcon, EditIcon, TrashIcon } from '../components/icons';
import { InvestmentFormModal } from '../components/InvestmentFormModal';
import { springSmooth, springTap } from '../lib/motion';

const overviewContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

type ModalState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; investment: Investment };

export function InvestmentsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<InvestmentSummary | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([api.getInvestmentSummary(year), api.listInvestments()]);
      if (requestId !== loadRequestRef.current) return;
      setSummary(s);
      setInvestments(list);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(data: InvestmentInput) {
    await api.createInvestment(data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleEdit(id: string, data: InvestmentInput) {
    await api.updateInvestment(id, data);
    setModal({ kind: 'closed' });
    await load();
  }
  async function handleDelete(id: string) {
    if (!confirm('Excluir este lançamento de investimento?')) return;
    await api.deleteInvestment(id);
    await load();
  }

  const maxMonthValue = summary
    ? Math.max(1, ...summary.months.map((m) => Math.max(m.contributed, m.withdrawn)))
    : 1;

  return (
    <div className="page">
      <h2 className="page-title">Investimentos</h2>

      <div className="section-head">
        <span />
        <motion.button
          className="btn-primary btn-sm"
          onClick={() => setModal({ kind: 'create' })}
          whileTap={{ scale: 0.95 }}
          transition={springTap}
        >
          + Novo
        </motion.button>
      </div>

      <div className="year-nav">
        <button className="month-arrow" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
          <ChevronLeftIcon />
        </button>
        <span className="month-label">{year}</span>
        <button className="month-arrow" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
          <ChevronRightIcon />
        </button>
      </div>

      {loading && !summary ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : summary ? (
        <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Saldo total investido</span>
            <span className="stat-value">{formatCurrency(summary.totalBalance)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Aportes no ano</span>
            <span className="stat-value">{formatCurrency(summary.totals.contributedYear)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Resgates no ano</span>
            <span className="stat-value">{formatCurrency(summary.totals.withdrawnYear)}</span>
          </motion.div>
          <motion.div className="stat-card overview-item" variants={overviewItem}>
            <span className="stat-label">Aporte líquido no ano</span>
            <span
              className="stat-value"
              style={{ color: summary.totals.netYear >= 0 ? 'var(--ok)' : 'var(--over)' }}
            >
              {formatCurrency(summary.totals.netYear)}
            </span>
          </motion.div>

          {/* Aportes x resgates por mês */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <div className="section-head">
              <h3 className="section-title">Aportes e resgates por mês</h3>
              <span className="hint">{summary.totals.entryCount} lançamentos no total</span>
            </div>
            <div className="chart">
              {summary.months.map((m) => {
                const contribH = (m.contributed / maxMonthValue) * 100;
                const withdrawH = (m.withdrawn / maxMonthValue) * 100;
                return (
                  <div
                    key={m.month}
                    className="chart-col"
                    title={`${monthShort(m.month)}: aporte ${formatCurrency(m.contributed)}, resgate ${formatCurrency(m.withdrawn)}`}
                  >
                    <div className="chart-bars">
                      <div className="chart-income" style={{ height: `${contribH}%` }} />
                      {m.withdrawn > 0 && (
                        <div className="chart-spent over" style={{ height: `${withdrawH}%` }} />
                      )}
                    </div>
                    <span className="chart-label">{monthShort(m.month)}</span>
                  </div>
                );
              })}
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-box income" /> Aporte
              </span>
              <span>
                <i className="legend-box" style={{ background: 'var(--over)' }} /> Resgate
              </span>
            </div>
          </motion.section>

          {/* Saldo por tipo */}
          {summary.byType.length > 0 && (
            <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
              <h3 className="section-title">Saldo por tipo</h3>
              <ul className="cat-list">
                {summary.byType.map((t) => {
                  const pct = summary.totalBalance > 0 ? (t.amount / summary.totalBalance) * 100 : 0;
                  return (
                    <li key={t.type} className="cat-row">
                      <div className="cat-head">
                        <span className="cat-dot" style={{ background: INVESTMENT_TYPE_COLOR[t.type] }} />
                        <span className="cat-name">{INVESTMENT_TYPE_LABEL[t.type]}</span>
                        <span className="cat-value">{formatCurrency(t.amount)}</span>
                      </div>
                      <div className="cat-bar">
                        <div
                          className="cat-bar-fill"
                          style={{ width: `${Math.max(0, pct)}%`, background: INVESTMENT_TYPE_COLOR[t.type] }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          )}

          {/* Histórico de lançamentos */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <h3 className="section-title">Lançamentos ({investments.length})</h3>
            {investments.length === 0 ? (
              <p className="empty">Nenhum investimento lançado ainda.</p>
            ) : (
              <ul className="exp-list">
                <AnimatePresence initial={false}>
                  {investments.map((inv) => (
                    <motion.li
                      key={inv.id}
                      className="exp-row"
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={springSmooth}
                      style={{ overflow: 'hidden' }}
                    >
                      <span className="exp-dot" style={{ background: INVESTMENT_TYPE_COLOR[inv.type] }} />
                      <div className="exp-main">
                        <span className="exp-desc">
                          {inv.description}
                          <span className={`tag ${inv.kind === 'APORTE' ? 'tag-income' : ''}`}>
                            {inv.kind === 'APORTE' ? 'aporte' : 'resgate'}
                          </span>
                        </span>
                        <span className="exp-meta">
                          {formatDayMonth(inv.date)} · {INVESTMENT_TYPE_LABEL[inv.type]}
                        </span>
                      </div>
                      <span
                        className={`exp-amount ${inv.kind === 'APORTE' ? 'exp-amount-pos' : 'exp-amount-neg'}`}
                      >
                        {inv.kind === 'APORTE' ? '+' : '−'}
                        {formatCurrency(inv.amount)}
                      </span>
                      <div className="exp-actions">
                        <button
                          className="icon-btn"
                          title="Editar"
                          onClick={() => setModal({ kind: 'edit', investment: inv })}
                        >
                          <EditIcon />
                        </button>
                        <button className="icon-btn" title="Excluir" onClick={() => handleDelete(inv.id)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.section>
        </motion.div>
      ) : null}

      {modal.kind === 'create' && (
        <InvestmentFormModal
          title="Novo investimento"
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={handleCreate}
        />
      )}
      {modal.kind === 'edit' && (
        <InvestmentFormModal
          title="Editar investimento"
          initial={modal.investment}
          onCancel={() => setModal({ kind: 'closed' })}
          onSubmit={(data) => handleEdit(modal.investment.id, data)}
        />
      )}
    </div>
  );
}
