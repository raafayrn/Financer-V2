import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { springSheet, springSmooth, springTap } from '../lib/motion';
import { GearIcon, MoonIcon, PiggyBankIcon, SunIcon } from './icons';

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

const NAV_ITEMS = [
  { to: '/', end: true, icon: HomeIcon, label: 'Início' },
  { to: '/relatorios', end: false, icon: ChartIcon, label: 'Relatórios' },
  { to: '/investimentos', end: false, icon: PiggyBankIcon, label: 'Investimentos' },
];

function isItemActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

export function Layout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/';

  return (
    <div className="layout">
      {/* Navbar — visível apenas no desktop (ver index.css) */}
      <header className="navbar-desktop">
        <span className="brand">Financer</span>
        <nav className="navbar-desktop-nav">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(location.pathname, item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="navbar-desktop-item"
                style={{ position: 'relative' }}
              >
                {active && (
                  <motion.span
                    layoutId="navbar-pill"
                    className="navbar-desktop-pill"
                    transition={springSheet}
                  />
                )}
                <span style={{ position: 'relative' }}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="navbar-desktop-right">
          {isDashboard && (
            <motion.button
              className="icon-btn-outline"
              title="Gerenciar categorias e orçamento"
              onClick={() => navigate('/?manage=1')}
              whileTap={{ scale: 0.9 }}
              transition={springTap}
            >
              <GearIcon />
            </motion.button>
          )}
          <motion.button
            className="icon-btn-outline"
            title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            onClick={toggleTheme}
            whileTap={{ scale: 0.9 }}
            transition={springTap}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </motion.button>
          <span className="user-name">{user?.name}</span>
        </div>
      </header>

      {/* Topo — visível apenas no mobile (ver index.css) */}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Financer</span>
          <div className="topbar-right">
            {isDashboard && (
              <motion.button
                className="icon-btn-outline"
                title="Gerenciar categorias e orçamento"
                onClick={() => navigate('/?manage=1')}
                whileTap={{ scale: 0.9 }}
                transition={springTap}
              >
                <GearIcon />
              </motion.button>
            )}
            <motion.button
              className="icon-btn-outline"
              title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              onClick={toggleTheme}
              whileTap={{ scale: 0.9 }}
              transition={springTap}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </motion.button>
            <span className="user-name">{user?.name}</span>
          </div>
        </div>
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

      {/* Menu inferior — visível apenas no mobile (ver index.css) */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(location.pathname, item);
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="nav-item-pill"
                  transition={springSheet}
                />
              )}
              <span className="nav-icon">
                <item.icon />
              </span>
              <span style={{ position: 'relative' }}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
