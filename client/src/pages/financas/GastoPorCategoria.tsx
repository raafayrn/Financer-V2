import { useState } from 'react';
import { formatCurrency } from '../../utils/format';
import { useFinancas } from './context';

const R = 62; // raio da rosca
const STROKE = 22;
const C = 2 * Math.PI * R;

/**
 * Gasto por categoria no formato do print "Spending by category": rosca com o
 * total no centro e, embaixo, uma barra por categoria com a porcentagem.
 * Passar o mouse numa fatia (ou numa linha) destaca as duas.
 */
export function GastoPorCategoria() {
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

  const head = (
    <div className="ms-card-head ms-card-head-plain">
      <h3 className="ms-card-title">Gasto por categoria</h3>
    </div>
  );

  if (slices.length === 0) {
    return (
      <section className="ms-card">
        {head}
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
      {head}
      <div className="ms-cat-donut">
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
            <span className="ms-muted">{active ? active.name : 'Total gasto'}</span>
            <span className="ms-donut-center-value">
              {formatCurrency(active ? active.value : total)}
            </span>
            <span className="ms-muted">{active ? `${active.pct.toFixed(1)}%` : 'neste mês'}</span>
          </div>
        </div>
      </div>

      <div className="ms-cat-list">
        {slices.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`ms-cat-row${hovered && hovered !== s.id ? ' dim' : ''}`}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            title={formatCurrency(s.value)}
          >
            <i style={{ background: s.color }} />
            <span className="ms-cat-name">{s.name}</span>
            <span className="ms-cat-bar">
              <span style={{ width: `${s.pct}%`, background: s.color }} />
            </span>
            <span className="ms-cat-pct">{Math.round(s.pct)}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}
