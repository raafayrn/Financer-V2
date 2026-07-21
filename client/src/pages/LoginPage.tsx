import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { springSheet, springSmooth, springTap } from '../lib/motion';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springSheet}
      >
        <h1 className="auth-title">Orbit</h1>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={mode}
            className="auth-subtitle"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={springSmooth}
          >
            {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}
          </motion.p>
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="auth-form">
          <AnimatePresence initial={false}>
            {mode === 'register' && (
              <motion.label
                className="field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSmooth}
                style={{ overflow: 'hidden' }}
              >
                <span>Nome</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </motion.label>
            )}
          </AnimatePresence>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <motion.button
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          whileTap={{ scale: 0.97 }}
          transition={springTap}
        >
          {mode === 'login'
            ? 'Não tem conta? Cadastre-se'
            : 'Já tem conta? Entrar'}
        </motion.button>
      </motion.div>
    </div>
  );
}
