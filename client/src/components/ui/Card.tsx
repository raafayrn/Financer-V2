import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { springTap } from '../../lib/motion';

type Density = 'compact' | 'default' | 'feature';

interface Props {
  children: ReactNode;
  /**
   * A densidade é o que devolve hierarquia à tela. Antes tudo era `.card`:
   * o mesmo vidro, o mesmo raio de 22px, o mesmo peso — o olho não tinha
   * onde pousar. `feature` é para o número herói da tela, `compact` para
   * blocos de apoio.
   */
  density?: Density;
  /** Torna o card acionável: vira <button>, ganha foco, hover e chevron. */
  onClick?: () => void;
  className?: string;
  span2?: boolean;
  title?: string;
}

export function Card({ children, density = 'default', onClick, className = '', span2, title }: Props) {
  const classes = [
    'card',
    density !== 'default' ? `card--${density}` : '',
    span2 ? 'overview-span-2' : '',
    onClick ? 'card--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <motion.button className={classes} onClick={onClick} title={title} whileTap={{ scale: 0.985 }} transition={springTap}>
        {children}
        <span className="card-chevron" aria-hidden="true">
          →
        </span>
      </motion.button>
    );
  }

  return (
    <section className={classes} title={title}>
      {children}
    </section>
  );
}
