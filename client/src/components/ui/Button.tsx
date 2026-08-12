import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { springTap } from '../../lib/motion';

type Variant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'icon';

interface Props {
  children: ReactNode;
  variant?: Variant;
  size?: 'sm' | 'md';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Obrigatório em `icon`: sem rótulo visível, o leitor de tela fica sem nada. */
  label?: string;
  className?: string;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-ghost',
  subtle: 'link-btn',
  danger: 'btn-ghost btn-danger',
  icon: 'icon-btn-outline',
};

/**
 * Unifica `.btn-primary`, `.btn-ghost`, `.link-btn` e `.icon-btn-outline`, que
 * eram quatro convenções soltas com estados de foco e alvos de toque
 * diferentes entre si.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled,
  label,
  className = '',
}: Props) {
  const classes = [VARIANT_CLASS[variant], size === 'sm' && variant !== 'icon' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      whileTap={disabled ? undefined : { scale: variant === 'icon' ? 0.9 : 0.95 }}
      transition={springTap}
    >
      {children}
    </motion.button>
  );
}
