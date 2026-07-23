import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { springSheet, springSmooth, springTap } from '../lib/motion';
import {
  BookIcon,
  GearIcon,
  HeartPulseIcon,
  MoonIcon,
  PiggyBankIcon,
  SunIcon,
  WalletIcon,
} from './icons';

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="7" width="4" height="13" rx="1" />
      <rect x="16" y="3" width="4" height="17" rx="1" />
    </svg>
  );
}

type NavItem = { to: string; end: boolean; icon: ComponentType; label: string };
type Section = { id: string; label: string; home: string; icon: ComponentType; items: NavItem[] };

// As 4 seções do planner. As seções são a navegação primária (barra inferior no
// mobile / pills no topo do desktop); os `items` são as sub-abas de cada uma.
const SECTIONS: Section[] = [
  {
    id: 'home',
    label: 'Home',
    home: '/home',
    icon: HomeIcon,
    items: [{ to: '/home', end: false, icon: HomeIcon, label: 'Home' }],
  },
  {
    id: 'financas',
    label: 'Finanças',
    home: '/',
    icon: WalletIcon,
    items: [
      { to: '/', end: true, icon: HomeIcon, label: 'Início' },
      { to: '/relatorios', end: false, icon: ChartIcon, label: 'Relatórios' },
      { to: '/investimentos', end: false, icon: PiggyBankIcon, label: 'Investimentos' },
    ],
  },
  {
    id: 'saude',
    label: 'Saúde',
    home: '/saude',
    icon: HeartPulseIcon,
    items: [{ to: '/saude', end: false, icon: HeartPulseIcon, label: 'Saúde' }],
  },
  {
    id: 'estudos',
    label: 'Estudos',
    home: '/estudos',
    icon: BookIcon,
    items: [{ to: '/estudos', end: false, icon: BookIcon, label: 'Estudos' }],
  },
];

function sectionForPath(pathname: string): Section {
  if (pathname === '/home') return SECTIONS[0];
  if (pathname.startsWith('/saude')) return SECTIONS[2];
  if (pathname.startsWith('/estudos')) return SECTIONS[3];
  return SECTIONS[1]; // /, /relatorios, /investimentos
}

function isItemActive(pathname: string, item: NavItem) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

/** Sub-abas da seção ativa como controle segmentado (mobile) ou linha (desktop). */
function SubTabs({ section, layoutId, variant }: { section: Section; layoutId: string; variant: 'segment' | 'row' }) {
  const location = useLocation();
  if (section.items.length < 2) return null; // seções de 1 aba não precisam de sub-nav
  return (
    <div className={variant === 'segment' ? 'subtabs-segment' : 'subtabs-row'}>
      {section.items.map((item) => {
        const active = isItemActive(location.pathname, item);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={variant === 'segment' ? 'subtab-seg-item' : 'subtab-row-item'}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={variant === 'segment' ? 'subtab-seg-pill' : 'subtab-row-underline'}
                transition={springSheet}
              />
            )}
            <span style={{ position: 'relative' }}>{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/';
  const section = sectionForPath(location.pathname);

  const gearButton = isDashboard && (
    <motion.button
      className="icon-btn-outline"
      title="Gerenciar categorias e orçamento"
      onClick={() => navigate('/?manage=1')}
      whileTap={{ scale: 0.9 }}
      transition={springTap}
    >
      <GearIcon />
    </motion.button>
  );

  const themeButton = (
    <motion.button
      className="icon-btn-outline"
      title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      onClick={toggleTheme}
      whileTap={{ scale: 0.9 }}
      transition={springTap}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </motion.button>
  );

  return (
    <div className="layout">
      {/* Navbar — desktop (2 níveis: seções em cima, sub-abas embaixo) */}
      <header className="navbar-desktop">
        <div className="navbar-desktop-top">
          <span className="brand">Orbit</span>
          <nav className="navbar-desktop-sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`navbar-section-item${s.id === section.id ? ' active' : ''}`}
                onClick={() => navigate(s.home)}
              >
                {s.id === section.id && (
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
            {gearButton}
            {themeButton}
            <span className="user-name">{user?.name}</span>
          </div>
        </div>
        {section.items.length > 1 && (
          <div className="navbar-desktop-sub">
            <SubTabs section={section} layoutId="desktop-subtab-underline" variant="row" />
          </div>
        )}
      </header>

      {/* Topo — mobile (marca + controles; sub-abas logo abaixo) */}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Orbit</span>
          <div className="topbar-right">
            {gearButton}
            {themeButton}
          </div>
        </div>
        {section.items.length > 1 && (
          <div className="topbar-subtabs">
            <SubTabs section={section} layoutId="mobile-subtab-pill" variant="segment" />
          </div>
        )}
      </header>

      <main className="content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={springSmooth}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Menu inferior — mobile: SEÇÕES (navegação primária) */}
      <nav className="bottom-nav">
        {SECTIONS.map((s) => {
          const active = s.id === section.id;
          return (
            <button
              key={s.id}
              className={`nav-item${active ? ' active' : ''}`}
              onClick={() => navigate(s.home)}
            >
              {active && <motion.span layoutId="bottom-nav-pill" className="nav-item-pill" transition={springSheet} />}
              <span className="nav-icon">
                <s.icon />
              </span>
              <span style={{ position: 'relative' }}>{s.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
