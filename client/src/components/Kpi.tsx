import type { ComponentType, ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  icon: ComponentType;
  /** Cor do ícone: good (verde), bad (vermelho), accent (laranja). */
  tone?: 'good' | 'bad' | 'accent';
  /** Card verde-água de destaque (o "Total Earnings" do print). */
  feature?: boolean;
  /** Linha de baixo: selo de variação + texto. */
  foot?: ReactNode;
  /** Botão no canto (ex.: editar a renda). */
  action?: ReactNode;
  className?: string;
  /** Sem moldura própria (quando mora dentro de outro card). */
  bare?: boolean;
}

/** Card de número: ícone + rótulo, valor grande e uma linha de contexto. */
export function Kpi({ label, value, icon: Icon, tone, feature, foot, action, className = '', bare }: Props) {
  return (
    <div className={`${bare ? '' : 'ms-card '}ms-kpi${feature ? ' ms-kpi-feature' : ''} ${className}`}>
      <div className="ms-kpi-head">
        <span className={`ms-kpi-icon${tone ? ` ${tone}` : ''}`}>
          <Icon />
        </span>
        <span className="ms-kpi-label">{label}</span>
        {action}
      </div>
      <span className="ms-kpi-value">{value}</span>
      {foot && <div className="ms-delta-line">{foot}</div>}
    </div>
  );
}

/**
 * Selo "↑ 8%". `goodWhenUp` diz se subir é bom (renda) ou ruim (gasto).
 * Variação nula ou sem base de comparação não vira selo.
 */
export function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct > 0;
  const good = pct === 0 ? null : up === goodWhenUp;
  return (
    <span className={`ms-delta${good === null ? '' : good ? ' ms-delta-good' : ' ms-delta-bad'}`}>
      {pct === 0 ? '=' : up ? '↑' : '↓'} {Math.abs(Math.round(pct))}%
    </span>
  );
}
