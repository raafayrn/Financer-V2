import { useMemo, useRef, useState } from 'react';
import { formatCompact, formatCurrency } from '../../utils/format';
import { useFinancas } from './context';
import { useHideValues } from '../../lib/hideValues';

const W = 640;
const H = 230;
const PAD = { top: 12, right: 12, bottom: 26, left: 58 };

/** Curva suave (Catmull-Rom → Bézier) pelos pontos, sem ultrapassar muito. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * "Income vs expenses" do print, adaptado ao que o Orbit sabe: o gasto
 * acumulado do mês, dia a dia (laranja), contra o ritmo que zeraria a renda
 * só no último dia (escuro). Laranja acima do escuro = gastando rápido demais.
 */
export function RitmoDeGastos() {
  const { expenses, summary, year, month } = useFinancas();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { hidden, mask } = useHideValues();
  const money = (v: number) => mask(formatCurrency(v));

  const days = new Date(year, month, 0).getDate();
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isFuture = new Date(year, month - 1, 1) > now;
  const lastDay = isCurrent ? now.getDate() : isFuture ? 0 : days;
  // Renda disponível do mês — a mesma base do "Ainda posso gastar".
  const limit = summary.income.total + summary.walletBalance;

  const cumulative = useMemo(() => {
    const perDay = new Array<number>(days + 1).fill(0);
    for (const e of expenses) {
      const d = Number(e.date.slice(8, 10));
      if (d >= 1 && d <= days) perDay[d] += e.amount;
    }
    const acc: number[] = [];
    let run = 0;
    for (let d = 1; d <= days; d++) {
      run += perDay[d];
      acc.push(run);
    }
    return acc;
  }, [expenses, days]);

  // Teto do eixo arredondado para um passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ),
  // senão as marcas viram R$ 1.037 / R$ 2.074…
  const rawMax = Math.max(100, limit, ...cumulative.slice(0, Math.max(1, lastDay)));
  const step = niceStep(rawMax / 4);
  const maxY = step * Math.ceil(rawMax / step);
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, days - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom);

  const real = cumulative.slice(0, lastDay).map((v, i) => ({ x: x(i + 1), y: y(v) }));
  const ideal = limit > 0 ? [{ x: x(1), y: y(limit / days) }, { x: x(days), y: y(limit) }] : [];
  const ticks = Array.from({ length: Math.round(maxY / step) + 1 }, (_, i) => i * step);
  const xTicks = [1, 5, 10, 15, 20, 25, days].filter((d, i, arr) => d <= days && arr.indexOf(d) === i);

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || lastDay === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const day = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (days - 1)) + 1;
    setHover(Math.max(1, Math.min(lastDay, day)));
  }

  // Setas percorrem os dias pelo teclado (o mouse não é o único jeito de ler).
  function onKey(ev: React.KeyboardEvent<SVGSVGElement>) {
    if (lastDay === 0) return;
    const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      setHover(ev.key === 'Home' ? 1 : lastDay);
    } else if (step !== 0) {
      ev.preventDefault();
      setHover((h) => Math.max(1, Math.min(lastDay, (h ?? lastDay) + step)));
    }
  }

  const hoverIdeal = hover !== null ? (limit / days) * hover : 0;
  const hoverReal = hover !== null ? cumulative[hover - 1] : 0;

  return (
    <section className="ms-card">
      <div className="ms-card-head ms-card-head-plain">
        <div>
          <h3 className="ms-card-title">Ritmo de gastos</h3>
          <span className="ms-muted">Toque ou passe o mouse para comparar cada dia.</span>
        </div>
        <div className="ms-card-actions ms-chart-legend">
          <span>
            <i style={{ background: 'var(--chart-1)' }} />
            Gasto acumulado
          </span>
          {limit > 0 && (
            <span>
              <i style={{ background: 'var(--chart-2)' }} />
              Ritmo da renda
            </span>
          )}
        </div>
      </div>
      <div className="ms-pace">
        <div className="ms-pace-wrap">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Gasto acumulado do mês comparado ao ritmo da renda. Use as setas para ver cada dia."
            tabIndex={lastDay === 0 ? -1 : 0}
            onPointerMove={onMove}
            onPointerDown={onMove}
            // No toque o "leave" vem logo depois do dedo sair; o valor
            // tocado fica na tela até tocar em outro lugar.
            onPointerLeave={(ev) => {
              if (ev.pointerType === 'mouse') setHover(null);
            }}
            onKeyDown={onKey}
            onFocus={() => setHover((h) => h ?? (lastDay || null))}
            onBlur={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="ms-pace-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="ms-pace-axis" x={PAD.left - 8} y={y(t) + 3} textAnchor="end">
                  {hidden ? '•••' : formatCompact(t)}
                </text>
              </g>
            ))}
            {xTicks.map((d) => (
              <text key={d} className="ms-pace-axis" x={x(d)} y={H - 6} textAnchor="middle">
                {String(d).padStart(2, '0')}/{String(month).padStart(2, '0')}
              </text>
            ))}
            {ideal.length > 0 && <path className="ms-pace-ideal" d={smoothPath(ideal)} />}
            {real.length > 0 && <path className="ms-pace-real" d={smoothPath(real)} />}
            {hover !== null && (
              <>
                <line className="ms-pace-cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
                <circle className="ms-pace-dot" cx={x(hover)} cy={y(hoverReal)} r={5} />
              </>
            )}
          </svg>
          {hover !== null && (
            <div
              className="ms-pace-tip"
              aria-live="polite"
              style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hoverReal) / H) * 100}%` }}
            >
              <b>
                Dia {hover}/{String(month).padStart(2, '0')}
              </b>
              Gasto: {money(hoverReal)}
              {limit > 0 && (
                <>
                  <br />
                  Ritmo: {money(hoverIdeal)}
                </>
              )}
            </div>
          )}
        </div>
        {lastDay === 0 && <p className="empty">Este mês ainda não começou.</p>}
      </div>
    </section>
  );
}
