import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Investment, InvestmentInput, InvestmentSummary } from '../api/types';
import { BrandIcon } from '../components/BrandIcon';
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
    <div className="ms-stack">
      {/* Uma faixa só: ano à esquerda, ação à direita. O título saiu porque a
          aba do header já diz que estamos em Investimentos. */}
      <div className="ms-toolbar">
        <div className="year-nav">
          <button className="month-arrow" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
            <ChevronLeftIcon />
          </button>
          <span className="month-label">{year}</span>
          <button className="month-arrow" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
            <ChevronRightIcon />
          </button>
        </div>
        <motion.button
          className="ms-btn ms-btn-primary"
          onClick={() => setModal({ kind: 'create' })}
          whileTap={{ scale: 0.95 }}
          transition={springTap}
        >
          + Novo
        </motion.button>
      </div>

      {loading && !summary ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : summary ? (
        <motion.div className="ms-stack" variants={overviewContainer} initial="hidden" animate="show">
          <motion.div className="ms-sources ms-sources-4" variants={overviewItem}>
            <div className="ms-card ms-source">
              <span className="ms-label">Saldo investido</span>
              <span className="ms-source-value">{formatCurrency(summary.totalBalance)}</span>
              <span className="ms-muted">total acumulado</span>
            </div>
            <div className="ms-card ms-source">
              <span className="ms-label">Aportes</span>
              <span className="ms-source-value" style={{ color: 'var(--ok)' }}>
                {formatCurrency(summary.totals.contributedYear)}
              </span>
              <span className="ms-muted">em {year}</span>
            </div>
            <div className="ms-card ms-source">
              <span className="ms-label">Resgates</span>
              <span className="ms-source-value" style={{ color: 'var(--over)' }}>
                {formatCurrency(summary.totals.withdrawnYear)}
              </span>
              <span className="ms-muted">em {year}</span>
            </div>
            <div className="ms-card ms-source">
              <span className="ms-label">Aporte líquido</span>
              <span
                className="ms-source-value"
                style={{ color: summary.totals.netYear >= 0 ? 'var(--ok)' : 'var(--over)' }}
              >
                {formatCurrency(summary.totals.netYear)}
              </span>
              <span className="ms-muted">aportes − resgates</span>
            </div>
          </motion.div>

          <div className="ms-grid-main-side">
            <div className="ms-stack">
              {/* Aportes x resgates por mês */}
              <motion.section className="ms-card" variants={overviewItem}>
                <div className="ms-card-head">
                  <h3 className="ms-card-title">Aportes e resgates por mês</h3>
                  <div className="ms-card-actions">
                    <span className="ms-muted">{summary.totals.entryCount} lançamentos</span>
                  </div>
                </div>
                <div className="ms-card-body">
                  <div className="ms-bars">
                    {summary.months.map((m) => (
                      <div
                        key={m.month}
                        className="ms-bar-col"
                        title={`${monthShort(m.month)}: aporte ${formatCurrency(m.contributed)}, resgate ${formatCurrency(m.withdrawn)}`}
                      >
                        <div className="ms-bar-track ms-bar-track-pair">
                          <div
                            className="ms-bar-fill ms-bar-in"
                            style={{ height: `${(m.contributed / maxMonthValue) * 100}%` }}
                          />
                          <div
                            className="ms-bar-fill ms-bar-out"
                            style={{ height: `${(m.withdrawn / maxMonthValue) * 100}%` }}
                          />
                        </div>
                        <span className="ms-bar-label">{monthShort(m.month)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ms-invoice-legend" style={{ marginTop: 14 }}>
                    <span>
                      <i className="ms-dot" style={{ background: 'var(--ok)' }} />
                      Aporte
                    </span>
                    <span>
                      <i className="ms-dot" style={{ background: 'var(--over)' }} />
                      Resgate
                    </span>
                  </div>
                </div>
              </motion.section>

              {/* Histórico de lançamentos */}
              <motion.section className="ms-card" variants={overviewItem}>
                <div className="ms-card-head">
                  <h3 className="ms-card-title">Lançamentos</h3>
                  <span className="ms-muted">{investments.length}</span>
                </div>
                {investments.length === 0 ? (
                  <p className="empty">Nenhum investimento lançado ainda.</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {investments.map((inv) => {
                      const aporte = inv.kind === 'APORTE';
                      return (
                        <motion.div
                          key={inv.id}
                          className="ms-ledger-row"
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={springSmooth}
                          style={{ overflow: 'hidden' }}
                        >
                          <BrandIcon
                            description={inv.description}
                            fallbackColor={INVESTMENT_TYPE_COLOR[inv.type]}
                            size={32}
                          />
                          <span className="ms-ledger-main">
                            <span className="ms-ledger-title">
                              {inv.description}
                              <span className="ms-ledger-badge">{aporte ? 'Aporte' : 'Resgate'}</span>
                            </span>
                            <span className="ms-ledger-meta">
                              <span style={{ color: INVESTMENT_TYPE_COLOR[inv.type] }}>
                                {INVESTMENT_TYPE_LABEL[inv.type]}
                              </span>
                              <span className="ms-ledger-sep">·</span>
                              {formatDayMonth(inv.date)}
                            </span>
                          </span>
                          <span className={`ms-ledger-amount${aporte ? ' ms-pos' : ''}`}>
                            {aporte ? '+' : '−'}
                            {formatCurrency(inv.amount)}
                          </span>
                          <span className="ms-row-actions">
                            <button
                              className="ms-icon-btn"
                              title="Editar"
                              onClick={() => setModal({ kind: 'edit', investment: inv })}
                            >
                              <EditIcon />
                            </button>
                            <button
                              className="ms-icon-btn"
                              title="Excluir"
                              onClick={() => handleDelete(inv.id)}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </motion.section>
            </div>

            {/* Saldo por tipo */}
            {summary.byType.length > 0 && (
              <motion.section className="ms-card" variants={overviewItem}>
                <div className="ms-card-head">
                  <h3 className="ms-card-title">Saldo por tipo</h3>
                </div>
                <div className="ms-card-body ms-stack" style={{ gap: 14 }}>
                  {summary.byType.map((t) => {
                    const pct = summary.totalBalance > 0 ? (t.amount / summary.totalBalance) * 100 : 0;
                    return (
                      <div key={t.type} className="ms-type-row">
                        <div className="ms-type-head">
                          <span
                            className="ms-legend-dot"
                            style={{ margin: 0, background: INVESTMENT_TYPE_COLOR[t.type] }}
                          />
                          <span className="ms-type-name">{INVESTMENT_TYPE_LABEL[t.type]}</span>
                          <span className="ms-type-pct">{pct.toFixed(0)}%</span>
                          <span className="ms-type-value">{formatCurrency(t.amount)}</span>
                        </div>
                        <div className="ms-type-bar">
                          <div
                            className="ms-type-bar-fill"
                            style={{
                              width: `${Math.max(0, pct)}%`,
                              background: INVESTMENT_TYPE_COLOR[t.type],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </div>
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
