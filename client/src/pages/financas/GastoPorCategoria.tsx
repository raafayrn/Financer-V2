import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../../utils/format';
import { useFinancas } from './context';

const R = 62; // raio do donut
const STROKE = 26;
const C = 2 * Math.PI * R;

// Legenda embutida no hero: altura de uma linha, largura minima de coluna e
// piso de altura (pra lista curta nao encolher o card).
const ROW_H = 32;
const MIN_COL_W = 190;
const COL_GAP = 24;
const MIN_LEGEND_H = 186;

/**
 * `compact` = versao de coluna estreita: donut menor e legenda embaixo, em vez
 * de anel grande com a legenda ao lado. Mesmo componente, sem duplicar a
 * matematica dos arcos.
 */
interface Props {
  /** Coluna estreita: anel menor com a legenda embaixo. */
  compact?: boolean;
  /** Sem moldura de card nem titulo — pra viver dentro de outro card. */
  inline?: boolean;
}

export function GastoPorCategoria({ compact = false, inline = false }: Props = {}) {
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
    if (inline) return null;
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

  // Quantas colunas cabem de fato na largura disponivel. Nao da pra deixar no
  // CSS: `column-width` e tratado como MINIMO — o navegador prefere vazar pra
  // fora do card a encolher a coluna. Entao a gente mede e decide.
  const legendRef = useRef<HTMLDivElement>(null);
  const [legendCols, setLegendCols] = useState(1);
  useEffect(() => {
    const el = legendRef.current;
    if (!inline || !el) return;
    const measure = () => {
      const w = el.clientWidth;
      setLegendCols(w >= 2 * MIN_COL_W + COL_GAP ? 2 : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // O resize da janela entra junto: mudar o numero de colunas nao altera a
    // largura do proprio elemento, entao o observer sozinho as vezes nao
    // reavalia quando a janela encolhe.
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [inline]);

  // A altura manda no multicol: com `column-fill: auto` a coluna so quebra
  // quando enche. Dividir a lista pelas colunas que cabem faz a segunda coluna
  // comecar na hora certa, sem inventar uma terceira pra fora do card.
  const legendStyle =
    inline && slices.length > 0
      ? {
          height: Math.max(MIN_LEGEND_H, Math.ceil(slices.length / legendCols) * ROW_H),
          columnCount: legendCols,
        }
      : undefined;

  const body = (
    <div
      className={`ms-donut-layout${compact ? ' ms-donut-compact' : ''}${
        inline ? ' ms-donut-inline' : ' ms-card-body'
      }`}
    >
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

        <div className="ms-legend" ref={legendRef} style={legendStyle}>
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
  );

  if (inline) return body;

  return (
    <section className="ms-card">
      <div className="ms-card-head">
        <h3 className="ms-card-title">Gasto por categoria</h3>
        <div className="ms-card-actions">
          <span className="ms-muted">{formatCurrency(total)} no total</span>
        </div>
      </div>
      {body}
    </section>
  );
}
