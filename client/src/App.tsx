import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { MonthProvider } from './context/MonthContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { FinancasPage } from './pages/financas/FinancasPage';
import { ResumoTab } from './pages/financas/ResumoTab';
import { LancamentosTab } from './pages/financas/LancamentosTab';
import { CategoriasTab } from './pages/financas/CategoriasTab';
import { RecorrentesPage } from './pages/recorrentes/RecorrentesPage';
import { FixasTab } from './pages/recorrentes/FixasTab';
import { ParcelamentosTab } from './pages/recorrentes/ParcelamentosTab';
import { ReportsPage } from './pages/ReportsPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { SaudePage } from './pages/SaudePage';
import { StudiesShell } from './pages/estudos/StudiesShell';
import { VisaoGeralTab } from './pages/estudos/VisaoGeralTab';
import { ProvasTab } from './pages/estudos/ProvasTab';
import { TarefasTab } from './pages/estudos/TarefasTab';
import { MateriasTab } from './pages/estudos/MateriasTab';
import { AgendaPage } from './pages/agenda/AgendaPage';

/**
 * Única tela fora do app: aparece quando a API não respondeu. Não existe tela
 * de login — o app entra sozinho na conta do dono (ver AuthContext).
 */
function OfflineScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Orbit</h1>
        <p className="auth-subtitle">{message}</p>
        <div className="alert alert-error">
          Verifique se o servidor está rodando e tente de novo.
        </div>
        <button className="btn-primary" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, error, retry } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <OfflineScreen message={error ?? 'Sessão indisponível.'} onRetry={retry} />;
  }

  return (
    <MonthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/financas" element={<FinancasPage />}>
            <Route index element={<ResumoTab />} />
            <Route path="lancamentos" element={<LancamentosTab />} />
            <Route path="categorias" element={<CategoriasTab />} />
          </Route>
          <Route path="/recorrentes" element={<RecorrentesPage />}>
            <Route index element={<FixasTab />} />
            <Route path="parcelamentos" element={<ParcelamentosTab />} />
          </Route>
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/investimentos" element={<InvestmentsPage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/agenda" element={<StudiesShell />}>
            <Route index element={<AgendaPage />} />
          </Route>
          <Route path="/estudos" element={<StudiesShell />}>
            <Route index element={<VisaoGeralTab />} />
            <Route path="provas" element={<ProvasTab />} />
            <Route path="tarefas" element={<TarefasTab />} />
            <Route path="materias" element={<MateriasTab />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MonthProvider>
  );
}
