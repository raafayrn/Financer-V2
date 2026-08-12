import type { ReactNode } from 'react';

interface Props {
  title: string;
  text?: string;
  action?: ReactNode;
}

/**
 * Estado vazio. Não existia: uma lista sem dados virava simplesmente uma área
 * em branco, sem dizer se estava carregando, se deu erro ou se não havia nada.
 */
export function EmptyState({ title, text, action }: Props) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {text && <p className="empty-state-text">{text}</p>}
      {action}
    </div>
  );
}
