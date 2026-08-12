import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRef, useState, type ComponentType } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useShell } from '../context/ShellContext';
import { springSheet, springSmooth, springTap } from '../lib/motion';
import { ChatBox } from './ChatBox';
import {
  BookIcon,
  DropletIcon,
  DumbbellIcon,
  GearIcon,
  HeartPulseIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  WalletIcon,
} from './icons';

const ROUTE_ORDER = ['/', '/financas', '/investimentos', '/saude', '/estudos', '/ajustes'];
function routeIndex(p: string) {
  const i = ROUTE_ORDER.indexOf(p);
  return i === -1 ? 0 : i;
}

const pageVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 28, scale: 0.985 }),
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -18, scale: 0.99 }),
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

type Section = { id: string; label: string; home: string; icon: ComponentType };

/**
 * Navegação primária. Relatórios virou o modo "Ano" de Finanças e
 * Investimentos virou sub-tela — nenhum dos dois disputa mais este nível, o
 * que eliminou a camada de sub-abas que existia no mobile.
 */
const SECTIONS: Section[] = [
  { id: 'home', label: 'Home', home: '/', icon: HomeIcon },
  { id: 'financas', label: 'Finanças', home: '/financas', icon: WalletIcon },
  { id: 'saude', label: 'Saúde', home: '/saude', icon: HeartPulseIcon },
  { id: 'estudos', label: 'Estudos', home: '/estudos', icon: BookIcon },
];

function sectionForPath(pathname: string): Section | null {
  if (pathname === '/') return SECTIONS[0];
  if (pathname.startsWith('/saude')) return SECTIONS[2];
  if (pathname.startsWith('/estudos')) return SECTIONS[3];
  if (pathname.startsWith('/financas') || pathname.startsWith('/investimentos')) return SECTIONS[1];
  return null; // /ajustes não é seção primária
}

/** Ações do "+", na ordem de uso de cada contexto. */
type QuickAction = { label: string; hint: string; to: string; icon: ComponentType };

const ACTION_EXPENSE: QuickAction = { label: 'Gasto', hint: 'Registrar uma saída', to: '/financas?new=expense', icon: WalletIcon };
const ACTION_INCOME: QuickAction = { label: 'Receita', hint: 'Registrar uma entrada', to: '/financas?new=income', icon: WalletIcon };
const ACTION_WATER: QuickAction = { label: 'Água', hint: 'Somar no total do dia', to: '/saude?new=water', icon: DropletIcon };
const ACTION_WORKOUT: QuickAction = { label: 'Treino', hint: 'Registrar o treino de hoje', to: '/saude?new=workout', icon: DumbbellIcon };
const ACTION_TASK: QuickAction = { label: 'Tarefa', hint: 'Com matéria e prazo', to: '/estudos?new=task', icon: BookIcon };
const ACTION_EVENT: QuickAction = { label: 'Evento', hint: 'Compromisso na agenda', to: '/estudos?new=event', icon: BookIcon };

/**
 * O "+" oferece primeiro o que faz sentido na tela atual, mas nunca esconde as
 * outras opções — registrar um gasto continua a um toque de qualquer lugar.
 */
function actionsForPath(pathname: string): QuickAction[] {
  if (pathname.startsWith('/saude')) {
    return [ACTION_WATER, ACTION_WORKOUT, ACTION_EXPENSE, ACTION_TASK];
  }
  if (pathname.startsWith('/estudos')) {
    return [ACTION_TASK, ACTION_EVENT, ACTION_EXPENSE, ACTION_WATER];
  }
  return [ACTION_EXPENSE, ACTION_INCOME, ACTION_WATER, ACTION_TASK];
}

function QuickAddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const actions = actionsForPath(location.pathname);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="quickadd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="quickadd-sheet"
            role="dialog"
            aria-label="Registrar"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={springSheet}
          >
            <span className="quickadd-title">Registrar</span>
            <div className="quickadd-grid">
              {actions.map((a) => (
                <button
                  key={a.to}
                  className="quickadd-item"
                  onClick={() => {
                    onClose();
                    navigate(a.to);
                  }}
                >
                  <span className="quickadd-icon">
                    <a.icon />
                  </span>
                  <span className="quickadd-item-text">
                    <strong>{a.label}</strong>
                    <small>{a.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Layout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { requestRefresh, setPendingPreviews } = useShell();
  const [quickAdd, setQuickAdd] = useState(false);
  const prevPath = useRef(location.pathname);
  const navDir = useRef(1);
  if (prevPath.current !== location.pathname) {
    navDir.current = routeIndex(location.pathname) >= routeIndex(prevPath.current) ? 1 : -1;
    prevPath.current = location.pathname;
  }
  const section = sectionForPath(location.pathname);

  const themeButton = (
    <motion.button
      className="icon-btn-outline"
      title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      onClick={toggleTheme}
      whileTap={{ scale: 0.9 }}
      transition={springTap}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </motion.button>
  );

  return (
    <div className="layout">
      {/* Navbar — desktop. Nível único: as sub-abas deixaram de existir. */}
      <header className="navbar-desktop">
        <div className="navbar-desktop-top">
          <span className="brand">Orbit</span>
          <nav className="navbar-desktop-sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`navbar-section-item${s.id === section?.id ? ' active' : ''}`}
                onClick={() => navigate(s.home)}
              >
                {s.id === section?.id && (
                  <motion.span layoutId="desktop-section-pill" className="navbar-section-pill" transition={springSheet} />
                )}
                <span className="navbar-section-icon">
                  <s.icon />
                </span>
                <span style={{ position: 'relative' }}>{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="navbar-desktop-right">
            <motion.button
              className="btn-primary navbar-add"
              onClick={() => setQuickAdd(true)}
              whileTap={{ scale: 0.95 }}
              transition={springTap}
            >
              <PlusIcon />
              <span>Registrar</span>
            </motion.button>
            {themeButton}
            <motion.button
              className={`icon-btn-outline${location.pathname === '/ajustes' ? ' icon-btn-outline-active' : ''}`}
              title="Ajustes"
              aria-label="Ajustes"
              onClick={() => navigate('/ajustes')}
              whileTap={{ scale: 0.9 }}
              transition={springTap}
            >
              <GearIcon />
            </motion.button>
            <span className="user-name">{user?.name}</span>
          </div>
        </div>
      </header>

      {/* O topbar mobile foi removido: o título agora é cabeçalho rolável da
          própria página (ver PageHeader), o que devolve ~90px de área útil. */}

      <main className="content">
        <AnimatePresence mode="wait" initial={false} custom={navDir.current}>
          <motion.div
            key={location.pathname}
            custom={navDir.current}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springSmooth}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Assistente — global. Antes só existia em /financas, escondendo o
          caminho mais rápido de lançar um gasto. */}
      <ChatBox
        onSaved={requestRefresh}
        onPreviews={(previews) => {
          setPendingPreviews(previews);
          navigate('/financas');
        }}
      />

      <QuickAddMenu open={quickAdd} onClose={() => setQuickAdd(false)} />

      {/* Menu inferior — mobile. O "+" ocupa o centro, o ponto mais alcançável
          do polegar, porque registrar é a ação mais repetida do app. */}
      <nav className="bottom-nav">
        {SECTIONS.slice(0, 2).map((s) => (
          <BottomNavItem key={s.id} section={s} active={s.id === section?.id} onClick={() => navigate(s.home)} />
        ))}

        <button
          className={`nav-add${quickAdd ? ' open' : ''}`}
          onClick={() => setQuickAdd((v) => !v)}
          aria-label="Registrar"
          aria-expanded={quickAdd}
        >
          <motion.span animate={{ rotate: quickAdd ? 45 : 0 }} transition={springTap} style={{ display: 'flex' }}>
            <PlusIcon />
          </motion.span>
        </button>

        {SECTIONS.slice(2).map((s) => (
          <BottomNavItem key={s.id} section={s} active={s.id === section?.id} onClick={() => navigate(s.home)} />
        ))}
      </nav>
    </div>
  );
}

function BottomNavItem({ section, active, onClick }: { section: Section; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      {active && <motion.span layoutId="bottom-nav-pill" className="nav-item-pill" transition={springSheet} />}
      <span className="nav-icon">
        <section.icon />
      </span>
      <span style={{ position: 'relative' }}>{section.label}</span>
    </button>
  );
}
