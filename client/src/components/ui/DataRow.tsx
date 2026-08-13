import type { ReactNode } from 'react';

interface Props {
  /** Faixa de cor à esquerda: categoria, matéria, tipo de investimento. */
  accent?: string;
  title: ReactNode;
  meta?: ReactNode;
  /** Valor alinhado à direita, sempre tabular. */
  value?: ReactNode;
  tone?: 'neutral' | 'pos' | 'neg';
  actions?: ReactNode;
  leading?: ReactNode;
}

/**
 * Linha de lista. Lançamento, investimento, tarefa e exercício eram quatro
 * listas quase idênticas escritas separadamente, cada uma com seu alinhamento
 * e sua forma de mostrar a cor da categoria.
 */
export function DataRow({ accent, title, meta, value, tone = 'neutral', actions, leading }: Props) {
  return (
    <li className="data-row">
      {accent && <span className="data-row-accent" style={{ background: accent }} />}
      {leading}
      <div className="data-row-main">
        <span className="data-row-title">{title}</span>
        {meta && <span className="data-row-meta">{meta}</span>}
      </div>
      {value !== undefined && (
        <span className={`data-row-value money ${tone !== 'neutral' ? tone : ''}`}>{value}</span>
      )}
      {actions && <div className="data-row-actions">{actions}</div>}
    </li>
  );
}
