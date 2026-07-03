import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MonthlyReport } from '../api/types';
import { formatCurrency, monthShort } from '../utils/format';

export function ReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getMonthlyReport(year)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [year]);

  const maxValue = report
    ? Math.max(1, ...report.months.map((m) => Math.max(m.spent, m.budget)))
    : 1;

  const totalSpent = report ? report.months.reduce((s, m) => s + m.spent, 0) : 0;

  return (
    <div className="page">
      <h2 className="page-title">Relatórios</h2>

      <div className="year-nav">
        <button className="month-arrow" onClick={() => setYear((y) => y - 1)}>
          ‹
        </button>
        <span className="month-label">{year}</span>
        <button className="month-arrow" onClick={() => setYear((y) => y + 1)}>
          ›
        </button>
      </div>

      {loading ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : report ? (
        <>
          <section className="card">
            <div className="section-head">
              <h3 className="section-title">Gasto x Orçamento por mês</h3>
              <span className="hint">Total no ano: {formatCurrency(totalSpent)}</span>
            </div>

            <div className="chart">
              {report.months.map((m) => {
                const spentH = (m.spent / maxValue) * 100;
                const budgetH = (m.budget / maxValue) * 100;
                const over = m.budget > 0 && m.spent > m.budget;
                return (
                  <div key={m.month} className="chart-col" title={`${monthShort(m.month)}: ${formatCurrency(m.spent)}`}>
                    <div className="chart-bars">
                      {m.budget > 0 && (
                        <div
                          className="chart-budget"
                          style={{ height: `${budgetH}%` }}
                          title={`Orçamento: ${formatCurrency(m.budget)}`}
                        />
                      )}
                      <div
                        className={`chart-spent ${over ? 'over' : ''}`}
                        style={{ height: `${spentH}%` }}
                      />
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
                <i className="legend-box budget" /> Orçamento
              </span>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
