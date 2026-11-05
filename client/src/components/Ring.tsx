import type { ReactNode } from 'react';

interface Props {
  /** 0–100; acima de 100 o anel fica cheio. */
  value: number;
  size?: number;
  stroke?: number;
  /** Cor do arco (token). */
  color?: string;
  children?: ReactNode;
}

/**
 * Anel de progresso dos cards de meta (água do dia, matérias). O centro é
 * livre: quem usa decide o que escrever dentro.
 */
export function Ring({ value, size = 96, stroke = 9, color = 'var(--chart-1)', children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="ms-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bar-idle)" strokeWidth={stroke} />
        {/* Em 0% o arco não é desenhado: a ponta redonda viraria um ponto. */}
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="ms-ring-center">{children}</span>
    </span>
  );
}
