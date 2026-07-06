import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { springSheet } from '../lib/motion';

interface Props {
  onCancel: () => void;
  children: (close: () => void) => ReactNode;
}

/**
 * Wrapper de modal compartilhado. Controla sua própria animação de saída
 * (bottom-sheet no mobile, morph central no desktop — ver .modal no CSS) e só
 * chama `onCancel` (que desmonta no componente pai) depois que a transição
 * termina, para a saída nunca "cortar" a animação.
 */
export function Modal({ onCancel, children }: Props) {
  const [show, setShow] = useState(true);
  const close = () => setShow(false);

  return (
    <AnimatePresence onExitComplete={onCancel}>
      {show && (
        <motion.div
          className="modal-backdrop"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        >
          <motion.div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 56, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={springSheet}
          >
            {children(close)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
