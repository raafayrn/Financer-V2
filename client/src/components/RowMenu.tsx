import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { springSheet, springTap } from '../lib/motion';

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
 * O menu é renderizado em portal (como o Dropdown) para não ser cortado pelo
 * overflow da lista nem ficar embaixo do cabeçalho sticky do grupo.
 */
export function RowMenu({ items, ariaLabel = 'Mais ações' }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updateRect() {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    updateRect();

    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  return (
    <div className="row-menu" ref={rootRef}>
      <button
        type="button"
        className={`ms-icon-btn${open ? ' ms-icon-btn-on' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              className="dropdown-menu row-menu-list"
              role="menu"
              // `left: auto` anula o `left: 0` do .dropdown-menu base (feito pra
              // menu de select, que copia a largura do gatilho) — sem isso o
              // menu estica de ponta a ponta da tela.
              style={{
                position: 'fixed',
                top: rect.top,
                left: 'auto',
                right: rect.right,
                width: 'max-content',
                transformOrigin: 'top right',
              }}
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={springSheet}
            >
              {items.map((item) => (
                <motion.button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`dropdown-item${item.danger ? ' dropdown-item-danger' : ''}`}
                  whileTap={{ scale: 0.97 }}
                  transition={springTap}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
