import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Investment, InvestmentInput, InvestmentSummary } from '../api/types';
import { BrandIcon } from '../components/BrandIcon';
import { formatCurrency, formatDayMonth, monthShort } from '../utils/format';
import { INVESTMENT_TYPE_COLOR, INVESTMENT_TYPE_LABEL } from '../utils/investments';
import {
  ArrowInIcon,
  ArrowOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  PiggyBankIcon,
  TrashIcon,
  TrendUpIcon,
} from '../components/icons';
import { Kpi } from '../components/Kpi';
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
          className="ms-btn ms-btn-ink"
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
          {/* Os quatro numeros no formato do "Total saved" do print. */}
          <motion.div className="ms-grid12" variants={overviewItem}>
            <Kpi
              className="span-3"
              feature
              label="Saldo investido"
              value={formatCurrency(summary.totalBalance)}
              icon={PiggyBankIcon}
              foot={<span>total acumulado</span>}
            />
            <Kpi
              className="span-3"
              label="Aportes"
              value={formatCurrency(summary.totals.contributedYear)}
              icon={ArrowInIcon}
              tone="good"
              foot={<span>em {year}</span>}
            />
            <Kpi
              className="span-3"
              label="Resgates"
              value={formatCurrency(summary.totals.withdrawnYear)}
              icon={ArrowOutIcon}
              tone="bad"
              foot={<span>em {year}</span>}
            />
            <Kpi
              className="span-3"
              label="Aporte líquido"
              value={formatCurrency(summary.totals.netYear)}
              icon={TrendUpIcon}
              tone={summary.totals.netYear >= 0 ? 'good' : 'bad'}
              foot={<span>aportes − resgates</span>}
            />
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
