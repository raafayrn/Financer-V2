import * as Menu from '@radix-ui/react-dropdown-menu';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Ação destrutiva (excluir) — sai em vermelho e no fim da lista. */
  danger?: boolean;
}

interface Props {
  items: RowMenuItem[];
  ariaLabel?: string;
}

/**
 * Menu de "…" da linha. As ações vinham como ícones soltos que só apareciam no
 * hover — invisíveis no toque e disputando espaço com o valor. Aqui vira um
 * alvo só, sempre no mesmo lugar, com os rótulos escritos.
 *
 * Mesma migração do Dropdown, pelos mesmos motivos (ver o comentário lá): o
 * Radix cuida de posição, clique fora, Escape, setas, Home/End,
 * digitar-para-buscar e devolução do foco ao gatilho. O portal continua sendo
 * necessário para o menu não ser cortado pelo overflow da lista nem ficar
 * embaixo do cabeçalho fixo do grupo — só que agora é o do Radix.
 */
export function RowMenu({ items, ariaLabel = 'Mais ações' }: Props) {
  return (
    <div className="row-menu">
      <Menu.Root>
        <Menu.Trigger className="ms-icon-btn" aria-label={ariaLabel}>
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Content
            className="dropdown-menu dropdown-menu-portal row-menu-list"
            align="end"
            sideOffset={6}
            style={{ width: 'max-content' }}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.label}
                className={`dropdown-item${item.danger ? ' dropdown-item-danger' : ''}`}
                onSelect={item.onSelect}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
