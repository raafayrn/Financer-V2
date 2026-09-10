import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError } from './api/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';
import './styles/monarch.css';
import { setupServiceWorker } from './registerSW';

/**
 * Defaults do cache de servidor. O padrão de uso é um app pessoal aberto
 * várias vezes ao dia, no celular e no desktop, onde quem edita os dados é o
 * próprio dono — por isso cache generoso e invalidação explícita na mutação
 * (ver client/src/api/queries.ts) em vez de refetch nervoso.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s: tempo de navegar entre Dashboard → Finanças → abas sem refazer a
      // mesma requisição. Mutação não espera esse prazo: invalida na hora.
      staleTime: 30 * 1000,
      // 30min na memória: voltar ao mês anterior (ou à tela anterior) usa o
      // cache e é instantâneo. Uma sessão real dura menos que isso.
      gcTime: 30 * 60 * 1000,
      // Erro do usuário/rota (4xx) não melhora com insistência; rede fora do ar
      // (status 0) e 5xx, sim. Duas tentativas no total.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      // Os dados mudam FORA do app: e-mail do Nubank, atalho do iPhone e bot do
      // Telegram lançam gastos sozinhos. Voltar para a aba é o momento exato de
      // buscar isso — e com staleTime de 30s não vira refetch a cada alt-tab.
      // O refetch é em background: a tela não volta pro spinner.
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Mutação não se repete sozinha: um POST de gasto que "falhou" pode ter
      // chegado ao servidor, e repetir lançaria a despesa duas vezes.
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

setupServiceWorker();
