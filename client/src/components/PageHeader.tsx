import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';
import { springTap } from '../lib/motion';
import { GearIcon, MoonIcon, SunIcon } from './icons';

interface Props {
  title: string;
  subtitle?: string;
  /** Ações específicas da tela, à direita do título. */
  actions?: ReactNode;
}

/**
 * Cabeçalho de tela. Substitui a antiga topbar fixa do mobile: rola junto com
 * o conteúdo em vez de ocupar altura permanente, e concentra os controles que
 * moravam nela (tema, ajustes). No desktop esses dois controles já vivem na
 * navbar, então aqui ficam escondidos por CSS.
 */
export function PageHeader({ title, subtitle, actions }: Props) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className="page-header-actions">
        {actions}
        <motion.button
          className="icon-btn-outline page-header-only-mobile"
          title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          onClick={toggleTheme}
          whileTap={{ scale: 0.9 }}
          transition={springTap}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </motion.button>
        <motion.button
          className="icon-btn-outline page-header-only-mobile"
          title="Ajustes"
          aria-label="Ajustes"
          onClick={() => navigate('/ajustes')}
          whileTap={{ scale: 0.9 }}
          transition={springTap}
        >
          <GearIcon />
        </motion.button>
      </div>
    </header>
  );
}
