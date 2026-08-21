import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ComponentType } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { springSheet } from '../lib/motion';
import { MonthNavigator } from './MonthNavigator';
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  GearIcon,
  GridIcon,
  HeartPulseIcon,
  HelpIcon,
  PanelIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  WalletIcon,
} from './icons';

type Tab = { to: string; label: string; end?: boolean };

type Entry = {
  /** Rota-raiz da seção; também é o que a sidebar destaca. */
  to: string;
  label: string;
  icon: ComponentType;
  /** Título grande no header da página (default: label). */
  title?: string;
  /** Abas sublinhadas ao lado do título. */
  tabs?: Tab[];
  /** Mostra o seletor de mês à direita do header. */
  month?: boolean;
  /** Aparece na barra inferior do mobile (máx. 5 itens). */
  mobile?: boolean;
};

/**
 * Navegação primária — espelha a sidebar do Monarch: ícone + label, um item por
 * seção. As sub-telas de cada seção são abas no header, não itens da sidebar.
 * Recorrentes e Investimentos são recortes das mesmas despesas do mês, então
 * moram dentro de Finanças em vez de disputarem a sidebar.
 */
const NAV: Entry[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon, month: true, mobile: true },
  {
    to: '/financas',
    label: 'Finanças',
    icon: WalletIcon,
    month: true,
    mobile: true,
    tabs: [
      { to: '/financas', label: 'Resumo', end: true },
      { to: '/financas/lancamentos', label: 'Lançamentos' },
      { to: '/financas/recorrentes', label: 'Fixas', end: true },
      { to: '/financas/recorrentes/parcelamentos', label: 'Parcelamentos' },
      { to: '/financas/investimentos', label: 'Investimentos' },
    ],
  },
  { to: '/agenda', label: 'Agenda', icon: CalendarIcon, mobile: true },
  { to: '/saude', label: 'Saúde', icon: HeartPulseIcon, mobile: true },
  {
    to: '/estudos',
    label: 'Estudos',
    icon: BookIcon,
    mobile: true,
    tabs: [
      { to: '/estudos', label: 'Visão geral', end: true },
      { to: '/estudos/provas', label: 'Provas' },
      { to: '/estudos/tarefas', label: 'Tarefas' },
      { to: '/estudos/materias', label: 'Matérias' },
    ],
  },
];

/** Telas fora da navegação principal, alcançadas pelos ícones do topo. */
const EXTRA: Entry[] = [{ to: '/ajustes', label: 'Ajustes', icon: GearIcon }];

function entryForPath(pathname: string): Entry {
  if (pathname === '/') return NAV[0];
  const match = [...NAV, ...EXTRA].find((e) => e.to !== '/' && pathname.startsWith(e.to));
  return match ?? NAV[0];
}

/** Abas sublinhadas do header (padrão Cash Flow / Spending / Income). */
function HeaderTabs({ tabs }: { tabs: Tab[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="ms-tabs">
      {tabs.map((tab) => {
        const active = tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
        return (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={`ms-tab${active ? ' active' : ''}`}>
            {tab.label}
            {active && (
              <motion.span layoutId="ms-tab-underline" className="ms-tab-underline" transition={springSheet} />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Lista de seções — usada tanto na sidebar fixa quanto no drawer do mobile.
 * Quem decide o item ativo é o próprio NavLink: ele já casa as sub-rotas
 * (/financas/lancamentos marca Finanças) e trata "/" como match exato.
 */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="ms-nav">
      {NAV.map((entry) => (
        <NavLink
          key={entry.to}
          to={entry.to}
          onClick={onNavigate}
          className={({ isActive }) => `ms-nav-item${isActive ? ' active' : ''}`}
        >
          <entry.icon />
          {entry.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const entry = entryForPath(location.pathname);

  // Trocar de rota fecha o drawer (inclusive no botão voltar do navegador).
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const utilities = (
    <>
      <button className="ms-icon-btn" title="Buscar" aria-label="Buscar">
        <SearchIcon />
      </button>
      <button className="ms-icon-btn" title="Notificações" aria-label="Notificações">
        <BellIcon />
      </button>
      <button
        className="ms-icon-btn"
        title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
        aria-label="Alternar tema"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        className="ms-icon-btn"
        title="Ajustes"
        aria-label="Ajustes"
        onClick={() => navigate('/ajustes')}
      >
        <GearIcon />
      </button>
    </>
  );

  return (
    <div className="ms-app">
      <aside className="ms-sidebar">
        <div className="ms-sidebar-top">
          <span className="ms-logo">O</span>
          {utilities}
        </div>
        <NavList />
        <div className="ms-sidebar-foot">
          <button className="ms-nav-item" title={user?.name}>
            <HelpIcon />
            Ajuda e suporte
          </button>
        </div>
      </aside>

      <div className="ms-main">
        <header className="ms-header">
          <button
            className="ms-icon-btn ms-only-mobile"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
          >
            <PanelIcon />
          </button>
          <h1 className="ms-header-title">{entry.title ?? entry.label}</h1>
          {entry.tabs && <HeaderTabs tabs={entry.tabs} />}
          <div className="ms-header-right">{entry.month && <MonthNavigator />}</div>
        </header>

        <main className="ms-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile: drawer com a sidebar inteira + barra inferior com os atalhos.
          Sem AnimatePresence de propósito: o exit não desmonta de forma
          confiável aqui, e um backdrop invisível preso bloquearia a tela. */}
      {drawerOpen && (
        <>
          <motion.div
            className="ms-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.aside
            className="ms-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            transition={springSheet}
          >
            <div className="ms-sidebar-top">
              <span className="ms-logo">O</span>
              {utilities}
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
            <div className="ms-sidebar-foot">
              <button className="ms-nav-item">
                <HelpIcon />
                Ajuda e suporte
              </button>
            </div>
          </motion.aside>
        </>
      )}

      <nav className="ms-mobile-nav">
        {NAV.filter((e) => e.mobile).map((e) => (
          <button
            key={e.to}
            className={`ms-mobile-nav-item${e.to === entry.to ? ' active' : ''}`}
            onClick={() => navigate(e.to)}
          >
            <e.icon />
            {e.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
