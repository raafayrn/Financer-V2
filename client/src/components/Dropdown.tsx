import * as Menu from '@radix-ui/react-dropdown-menu';

interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}

/**
 * Seletor de valor único, sobre @radix-ui/react-dropdown-menu.
 *
 * O que a versão anterior fazia na mão e agora é do Radix:
 *
 *   - POSIÇÃO. Havia um getBoundingClientRect com listeners de `resize` e
 *     `scroll` (em captura) recalculando `top`/`left` a cada quadro de rolagem.
 *     O `align`/`sideOffset` do Radix faz isso, e ainda vira o menu para cima
 *     quando não cabe embaixo — o que a conta manual não fazia.
 *   - FECHAR AO CLICAR FORA. Era um `mousedown` no document com uma exceção
 *     para o menu (que vive em portal, fora do rootRef).
 *   - PONTEIRO ÓRFÃO. O `pointerEvents = 'none'` imperativo existia porque, se
 *     o AnimatePresence não desmontasse o menu, o nó ficava por cima do modal
 *     engolindo clique. Sem AnimatePresence, o problema deixa de existir.
 *
 * O que é novo, e era o ponto da migração: navegação por setas, Home/End,
 * digitar-para-buscar, Escape, foco de volta no gatilho ao fechar, e o
 * `aria-activedescendant` que um `role="listbox"` feito à mão não tinha.
 *
 * As classes CSS são as mesmas (.dropdown, .dropdown-trigger, .dropdown-menu,
 * .dropdown-item). A animação virou CSS ancorada no `data-state` do Radix — o
 * framer-motion não fecha o ciclo de saída em elementos passados por `asChild`
 * (ver o comentário em Modal.tsx), e aqui o menu precisa MESMO sumir do DOM.
 *
 * É um menu de rádio, não um listbox: para o leitor de tela, "uma opção marcada
 * entre várias" é exatamente o que este componente faz.
 */
export function Dropdown({ value, options, onChange, ariaLabel }: Props) {
  const selected = options.find((o) => o.value === value);

  return (
    <div className="dropdown">
      <Menu.Root>
        <Menu.Trigger className="dropdown-trigger" aria-label={ariaLabel}>
          <span>{selected?.label ?? ''}</span>
          <svg
            className="dropdown-chevron"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Content
            className="dropdown-menu dropdown-menu-portal"
            align="start"
            sideOffset={8}
            // Copia a largura do gatilho, como o menu antigo fazia com o
            // width medido na mão.
            style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
          >
            <Menu.RadioGroup value={value} onValueChange={onChange}>
              {options.map((o) => (
                <Menu.RadioItem
                  key={o.value}
                  value={o.value}
                  className={`dropdown-item ${o.value === value ? 'dropdown-item-active' : ''}`}
                >
                  {o.label}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
