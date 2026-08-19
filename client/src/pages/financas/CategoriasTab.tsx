import { useState } from 'react';
import { formatCurrency } from '../../utils/format';
import { useFinancas } from './context';

const R = 62; // raio do donut
const STROKE = 26;
const C = 2 * Math.PI * R;

export function CategoriasTab() {
  const { summary } = useFinancas();
  const [hovered, setHovered] = useState<string | null>(null);

  const total = summary.totalSpent;
  const slices = summary.byCategory
    .filter((c) => c.spent > 0)
    .map((c) => ({
      id: c.categoryId ?? 'none',
      name: c.categoryName,
      color: c.color,
      value: c.spent,
      pct: total > 0 ? (c.spent / total) * 100 : 0,
    }));

  if (slices.length === 0) {
    return (
      <section className="ms-card">
        <div className="ms-card-body">
          <p className="empty">Nenhum gasto neste mês.</p>
        </div>
      </section>
    );
  }

  const active = slices.find((s) => s.id === hovered);

  // Cada fatia é um arco desenhado com dash: o offset acumula o que já passou.
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.pct / 100) * C;
    const arc = { ...s, len, dashOffset: -offset };
    offset += len;
    return arc;
  });

  return (
    <section className="ms-card">
      <div className="ms-card-head">
        <h3 className="ms-card-title">Gasto por categoria</h3>
        <div className="ms-card-actions">
          <span className="ms-muted">{formatCurrency(total)} no total</span>
        </div>
      </div>

      <div className="ms-card-body ms-donut-layout">
        <div className="ms-donut-wrap">
          <svg viewBox="0 0 160 160" className="ms-donut" role="img" aria-label="Gasto por categoria">
            <g transform="rotate(-90 80 80)">
              {arcs.map((a) => (
                <circle
                  key={a.id}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hovered === a.id ? STROKE + 5 : STROKE}
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={a.dashOffset}
                  opacity={hovered && hovered !== a.id ? 0.35 : 1}
                  onMouseEnter={() => setHovered(a.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ transition: 'opacity .15s, stroke-width .15s' }}
                />
              ))}
            </g>
          </svg>
          <div className="ms-donut-center">
            <span className="ms-label">{active ? active.name : 'Total'}</span>
            <span className="ms-donut-center-value">
              {formatCurrency(active ? active.value : total)}
            </span>
            {active && <span className="ms-muted">{active.pct.toFixed(1)}%</span>}
          </div>
        </div>

        <div className="ms-legend">
          {slices.map((s) => (
            <button
              key={s.id}
              className="ms-legend-item"
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="ms-legend-dot" style={{ background: s.color }} />
              <span>
                <span className="ms-legend-label">{s.name}</span>
                <span className="ms-legend-value">
                  {formatCurrency(s.value)}{' '}
                  <span className="ms-muted">({s.pct.toFixed(1)}%)</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
