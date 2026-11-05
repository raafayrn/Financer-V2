import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, type ComponentType, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { springSheet, springTap } from '../lib/motion';
import { usePendingIngestions } from '../hooks/usePendingIngestions';
import { MonthNavigator } from './MonthNavigator';
import { QuickActionsProvider, useQuickActions } from './QuickActions';
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  GearIcon,
  GridIcon,
  HeartPulseIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  WalletIcon,
} from './icons';

type Tab = {
  to: string;
  label: string;
  end?: boolean;
  /** Subtítulo do cabeçalho quando esta aba está aberta. */
  subtitle?: string;
  /** Contador ao lado do label — hoje só a fila de pendentes usa. */
  badge?: 'ingestions';
};

type Entry = {
  /** Rota-raiz da seção; também é o que o trilho destaca. */
  to: string;
  label: string;
  icon: ComponentType;
  /** Título grande do cabeçalho (default: label). */
  title?: string;
  subtitle?: string;
  /** Sub-telas da seção: vão no dock (desktop) ou em pílulas (celular). */
  tabs?: Tab[];
  /** Mostra o seletor de mês à direita do cabeçalho. */
  month?: boolean;
  /** Aparece no dock do celular (máx. 5 itens). */
  mobile?: boolean;
};

/**
 * Navegação primária: um item por seção, no trilho de ícones (desktop) e no
 * dock (celular). As sub-telas de cada seção são abas — no desktop moram no
 * dock de baixo, no celular viram pílulas sob o título.
 */
const NAV: Entry[] = [
  {
    to: '/',
    label: 'Início',
    icon: GridIcon,
    subtitle: 'Seu mês, seu dia e o que vem pela frente.',
    month: true,
    mobile: true,
  },
  {
    to: '/financas',
    label: 'Finanças',
    icon: WalletIcon,
    month: true,
    mobile: true,
    tabs: [
      { to: '/financas', label: 'Resumo', end: true, subtitle: 'De onde o dinheiro vem e para onde ele vai.' },
      { to: '/financas/lancamentos', label: 'Lançamentos', subtitle: 'Tudo o que entrou e saiu no mês.' },
      { to: '/financas/pendentes', label: 'Pendentes', badge: 'ingestions', subtitle: 'Gastos que chegaram sozinhos e esperam sua confirmação.' },
      { to: '/financas/recorrentes', label: 'Fixas', end: true, subtitle: 'Contas que se repetem todo mês.' },
      { to: '/financas/recorrentes/parcelamentos', label: 'Parcelamentos', subtitle: 'Compras parceladas e quanto falta.' },
      { to: '/financas/investimentos', label: 'Investimentos', subtitle: 'O que você guardou e como está rendendo.' },
    ],
  },
  { to: '/agenda', label: 'Agenda', icon: CalendarIcon, subtitle: 'Compromissos, aulas e prazos.', mobile: true },
  { to: '/saude', label: 'Saúde', icon: HeartPulseIcon, subtitle: 'Treinos, água e medidas.', mobile: true },
  {
    to: '/estudos',
    label: 'Estudos',
    icon: BookIcon,
    mobile: true,
    tabs: [
      { to: '/estudos', label: 'Visão geral', end: true, subtitle: 'Matérias, provas e tarefas num olhar.' },
      { to: '/estudos/provas', label: 'Provas', subtitle: 'Avaliações por proximidade.' },
      { to: '/estudos/tarefas', label: 'Tarefas', subtitle: 'O que falta entregar.' },
      { to: '/estudos/materias', label: 'Matérias', subtitle: 'Conteúdo e progresso de cada matéria.' },
    ],
  },
];

/** Telas fora da navegação principal, alcançadas pelo pé do trilho / topo. */
const EXTRA: Entry[] = [
  { to: '/ajustes', label: 'Ajustes', icon: GearIcon, subtitle: 'Aparência, conta e integrações.' },
];

function entryForPath(pathname: string): Entry {
  if (pathname === '/') return NAV[0];
  const match = [...NAV, ...EXTRA].find((e) => e.to !== '/' && pathname.startsWith(e.to));
  return match ?? NAV[0];
}

function isTabActive(tab: Tab, pathname: string) {
  return tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
}

/** Aba ativa da seção — a mais específica que casar (Fixas vs Parcelamentos). */
function activeTab(entry: Entry, pathname: string): Tab | undefined {
  return entry.tabs
    ?.filter((t) => isTabActive(t, pathname))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 13.8 9a2 2 0 0 0 1.3 1.3L20.5 12l-5.4 1.8a2 2 0 0 0-1.3 1.3L12 20.5l-1.8-5.4a2 2 0 0 0-1.3-1.3L3.5 12l5.4-1.8A2 2 0 0 0 10.2 9L12 3.5Z" />
    </svg>
  );
}

/** Pílulas de sub-aba. `layoutId` distingue o dock do cabeçalho do celular. */
function TabPills({
  tabs,
  layoutId,
  className,
  pendingIngestions,
}: {
  tabs: Tab[];
  layoutId: string;
  className: string;
  pendingIngestions: number;
}) {
  const { pathname } = useLocation();
  const current = [...tabs].filter((t) => isTabActive(t, pathname)).sort((a, b) => b.to.length - a.to.length)[0];
  return (
    <nav className={className}>
      {tabs.map((tab) => {
        const active = tab === current;
        const badge = tab.badge === 'ingestions' ? pendingIngestions : 0;
        return (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={`ms-pill-tab${active ? ' active' : ''}`}>
            {active && <motion.span layoutId={layoutId} className="ms-pill-tab-bg" transition={springSheet} />}
            <span className="ms-pill-tab-label">
              {tab.label}
              {badge > 0 && <span className="ms-tab-badge">{badge}</span>}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Barra do topo: saudação, campo do assistente e utilitários. */
function TopBar({ pendingIngestions }: { pendingIngestions: number }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { openChat } = useQuickActions();
  const navigate = useNavigate();
  const [command, setCommand] = useState('');
  const firstName = user?.name?.split(' ')[0] ?? '';

  function submit(e: FormEvent) {
    e.preventDefault();
    openChat(command);
    setCommand('');
  }

  return (
    <header className="ms-topbar">
      <div className="ms-topbar-who">
        <span className="ms-avatar" aria-hidden="true">
          {firstName.slice(0, 1).toUpperCase() || 'O'}
        </span>
        <span className="ms-topbar-hello">Olá, {firstName}</span>
      </div>

      <form className="ms-command" onSubmit={submit} role="search">
        <span className="ms-command-orb" aria-hidden="true" />
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onFocus={() => {
            // Campo vazio: o foco já abre o painel com os exemplos.
            if (!command) openChat();
          }}
          placeholder="Gastei 50 no mercado… ou pergunte algo"
          aria-label="Falar com o assistente"
          maxLength={1000}
        />
      </form>

      <div className="ms-topbar-tools">
        <button
          className="ms-round-btn ms-only-mobile"
          title="Assistente"
          aria-label="Abrir assistente"
          onClick={() => openChat()}
        >
          <SparkIcon />
        </button>
        <button
          className="ms-round-btn"
          title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          aria-label="Alternar tema"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {/* O sino aponta para a fila de pendentes — o único aviso que o app tem. */}
        <button
          className="ms-round-btn ms-round-btn-solid"
          title={pendingIngestions > 0 ? `${pendingIngestions} gasto(s) para confirmar` : 'Nada para confirmar'}
          aria-label="Pendentes"
          onClick={() => navigate('/financas/pendentes')}
        >
          <BellIcon />
          {pendingIngestions > 0 && <span className="ms-round-btn-dot" />}
        </button>
      </div>
    </header>
  );
}

/** Trilho de ícones (só desktop). O tooltip é CSS puro, sem AnimatePresence. */
function Rail() {
  const items = (list: Entry[]) =>
    list.map((entry) => (
      <NavLink
        key={entry.to}
        to={entry.to}
        end={entry.to === '/'}
        aria-label={entry.label}
        data-tip={entry.label}
        className={({ isActive }) => `ms-rail-item${isActive ? ' active' : ''}`}
      >
        <entry.icon />
      </NavLink>
    ));
  return (
    <nav className="ms-rail" aria-label="Seções">
      {items(NAV)}
      <span className="ms-rail-sep" />
      {items(EXTRA)}
    </nav>
  );
}

/** Dock flutuante: sub-abas da seção (desktop) ou seções (celular) + novo gasto. */
function Dock({ entry, pendingIngestions }: { entry: Entry; pendingIngestions: number }) {
  const { newExpense } = useQuickActions();
  const navigate = useNavigate();
  const plus = (
    <motion.button
      className="ms-dock-plus"
      onClick={newExpense}
      title="Novo gasto"
      aria-label="Novo gasto"
      whileTap={{ scale: 0.9 }}
      transition={springTap}
    >
      <PlusIcon />
    </motion.button>
  );
  return (
    <>
      <div className="ms-dock ms-dock-desktop">
        {entry.tabs ? (
          <TabPills
            tabs={entry.tabs}
            layoutId="ms-dock-pill"
            className="ms-dock-tabs"
            pendingIngestions={pendingIngestions}
          />
        ) : (
          <nav className="ms-dock-tabs">
            <span className="ms-pill-tab active">
              <span className="ms-pill-tab-bg" />
              <span className="ms-pill-tab-label">{entry.label}</span>
            </span>
          </nav>
        )}
        {plus}
      </div>

      <div className="ms-dock ms-dock-mobile">
        <nav className="ms-dock-sections">
          {NAV.filter((e) => e.mobile).map((e) => {
            const active = e.to === entry.to;
            return (
              <button
                key={e.to}
                className={`ms-dock-section${active ? ' active' : ''}`}
                onClick={() => navigate(e.to)}
                aria-current={active ? 'page' : undefined}
              >
                {active && <motion.span layoutId="ms-dock-section-bg" className="ms-dock-section-bg" transition={springSheet} />}
                <e.icon />
                <span>{e.label}</span>
              </button>
            );
          })}
        </nav>
        {plus}
      </div>
    </>
  );
}

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const entry = entryForPath(location.pathname);
  const tab = activeTab(entry, location.pathname);
  const firstName = user?.name?.split(' ')[0] ?? '';
  // Um contador só para a casca inteira (topo, dock e pílulas do celular).
  const pendingIngestions = usePendingIngestions();

  // O Início cumprimenta, como no print de referência; o resto mostra a aba.
  const title = entry.to === '/' ? `${greeting()}, ${firstName}` : (tab?.label ?? entry.title ?? entry.label);
  const subtitle = tab?.subtitle ?? entry.subtitle;

  return (
    <div className="ms-app">
      <TopBar pendingIngestions={pendingIngestions} />
      <div className="ms-frame">
        <Rail />
        <main className="ms-stage">
          <div className="ms-page-head">
            <div className="ms-page-titles">
              <h1 className="ms-page-title">{title}</h1>
              {subtitle && <p className="ms-page-subtitle">{subtitle}</p>}
            </div>
            {entry.month && (
              <div className="ms-page-tools">
                <MonthNavigator />
              </div>
            )}
          </div>
          {entry.tabs && (
            <TabPills
              tabs={entry.tabs}
              layoutId="ms-head-pill"
              className="ms-head-tabs"
              pendingIngestions={pendingIngestions}
            />
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="ms-page"
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
      <Dock entry={entry} pendingIngestions={pendingIngestions} />
    </div>
  );
}

export function Layout() {
  return (
    <QuickActionsProvider>
      <Shell />
    </QuickActionsProvider>
  );
}
