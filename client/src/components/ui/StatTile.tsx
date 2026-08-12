import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  /** Estado semântico do valor — separado do acento da marca. */
  tone?: 'neutral' | 'pos' | 'neg' | 'warn';
  /** Texto de apoio: comparação, período, contagem. */
  hint?: ReactNode;
  /** Barra de proporção 0–100. */
  percent?: number;
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
  neutral: '',
  pos: 'pos',
  neg: 'neg',
  warn: 'warn',
};

/**
 * Bloco de estatística. Cada tela remontava o seu à mão, com rótulos em
 * tamanhos diferentes e sem `tabular-nums` — números não alinhavam em coluna.
 */
export function StatTile({ label, value, tone = 'neutral', hint, percent }: Props) {
  return (
    <div className="stat-card stat-tile">
      <span className="stat-label">{label}</span>
      <span className={`stat-value money ${TONE_CLASS[tone]}`}>{value}</span>
      {hint && <span className="stat-tile-hint">{hint}</span>}
      {percent !== undefined && (
        <div className="stat-tile-bar">
          <div
            className={`stat-tile-bar-fill ${TONE_CLASS[tone]}`}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
      )}
    </div>
  );
}
