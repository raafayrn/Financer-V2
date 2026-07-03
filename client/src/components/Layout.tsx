import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', end: true, icon: '🏠', label: 'Início' },
  { to: '/relatorios', end: false, icon: '📊', label: 'Relatórios' },
  { to: '/ajustes', end: false, icon: '⚙️', label: 'Ajustes' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      {/* Navbar — visível apenas no desktop (ver index.css) */}
      <header className="navbar-desktop">
        <span className="brand">💰 Controle</span>
        <nav className="navbar-desktop-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="navbar-desktop-item">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="navbar-desktop-right">
          <span className="user-name">{user?.name}</span>
          <button className="btn-ghost btn-sm" onClick={logout} title="Sair">
            Sair
          </button>
        </div>
      </header>

      {/* Topo — visível apenas no mobile (ver index.css) */}
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">💰 Controle</span>
          <div className="topbar-right">
            <span className="user-name">{user?.name}</span>
            <button className="btn-ghost" onClick={logout} title="Sair">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      {/* Menu inferior — visível apenas no mobile (ver index.css) */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
