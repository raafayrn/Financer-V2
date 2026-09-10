import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * ============================================================
 * ESTADO VAZIO
 * ============================================================
 *
 * Lista sem nada era uma frase solta e cinza no meio do card — indistinguível
 * de erro, de filtro mal aplicado e de "ainda carregando". Um estado vazio
 * projetado responde três coisas: o que era para estar aqui, por que não está,
 * e o que fazer a respeito.
 *
 * Daí o formato: ícone + título curto + uma linha de explicação + a ação
 * primária. A ação é a parte que importa — sem ela o vazio continua sendo um
 * beco sem saída. Quando de fato não há nada a fazer (um dia sem aula, tarefas
 * todas concluídas), aí sim vai sem botão.
 *
 * `compact` é para os cards do dashboard, onde o vazio divide espaço com o
 * resto da tela: mesmo desenho, sem a linha de explicação.
 */
interface Props {
  /** Ícone de client/src/components/icons.tsx. Decorativo — fica aria-hidden. */
  icon?: ReactNode;
  title: string;
  /** Uma linha. Se precisar de duas, o texto está explicando demais. */
  description?: string;
  /** Ação primária: botão (onClick) ou navegação (to). */
  action?: { label: string; onClick?: () => void; to?: string };
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact }: Props) {
  return (
    <div className={`empty-state${compact ? ' empty-state-compact' : ''}`}>
      {icon && (
        <span className="empty-state-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {description && !compact && <p className="empty-state-text">{description}</p>}
      {action &&
        (action.to ? (
          <Link className="ms-btn ms-btn-primary empty-state-action" to={action.to}>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            className="ms-btn ms-btn-primary empty-state-action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
