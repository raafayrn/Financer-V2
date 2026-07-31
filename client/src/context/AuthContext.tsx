import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearToken, getToken, setToken } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Preenchido quando não deu para abrir a sessão (normalmente: API fora do ar). */
  error: string | null;
  /** Tenta abrir a sessão de novo (botão da tela de erro). */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // O app não tem tela de login: é de uso pessoal e sempre entra na conta do
  // dono. Reaproveita o token salvo enquanto ele valer e, quando não houver
  // (ou tiver expirado), pede um novo em /auth/auto — que cria a conta na
  // primeira execução. Só falha se a API estiver fora do ar.
  useEffect(() => {
    let cancelled = false;

    async function openSession() {
      setLoading(true);
      setError(null);
      try {
        if (getToken()) {
          try {
            const me = await api.me();
            if (!cancelled) setUser(me);
            return;
          } catch {
            // Token inválido/expirado: descarta e cai no auto-login.
            clearToken();
          }
        }
        const res = await api.autoLogin();
        if (cancelled) return;
        setToken(res.token);
        setUser(res.user);
      } catch {
        if (!cancelled) setError('Não foi possível conectar ao servidor do Orbit.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void openSession();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => ({ user, loading, error, retry }), [user, loading, error, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
