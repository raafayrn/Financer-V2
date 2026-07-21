import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Category, TelegramStatus } from '../api/types';
import { formatCurrency, monthName } from '../utils/format';
import { springSmooth, springTap } from '../lib/motion';
import { Modal } from './Modal';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

interface Props {
  year: number;
  month: number;
  onCancel: () => void;
  onCategoriesChanged: () => void;
}

/**
 * Modal de "Gerenciar" — orçamento mensal e categorias. Salário/VR já são
 * editáveis direto pelo Dashboard (IncomeSourcesModal); isso fica aqui pra não
 * sobrecarregar o dashboard com formulários usados esporadicamente.
 */
export function ManageModal({ year, month, onCancel, onCategoriesChanged }: Props) {
  // --- Orçamento do mês ---
  const [budget, setBudget] = useState('');
  const [savedBudget, setSavedBudget] = useState(0);
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const loadBudget = useCallback(async () => {
    const b = await api.getBudget(year, month);
    setSavedBudget(b.amount);
    setBudget(b.amount > 0 ? String(b.amount) : '');
  }, [year, month]);

  useEffect(() => {
    void loadBudget();
  }, [loadBudget]);

  async function saveBudget(e: FormEvent) {
    e.preventDefault();
    setBudgetMsg(null);
    setBudgetError(null);
    const value = Number(budget.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setBudgetError('Informe um valor maior que zero.');
      return;
    }
    try {
      const res = await api.setBudget(year, month, value);
      setSavedBudget(res.amount);
      setBudgetMsg('Orçamento salvo!');
    } catch (err) {
      setBudgetError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    }
  }

  // --- Categorias ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[4]);
  const [catError, setCatError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setCategories(await api.listCategories());
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setCatError(null);
    try {
      await api.createCategory({ name: newName.trim(), color: newColor });
      setNewName('');
      await loadCategories();
      onCategoriesChanged();
    } catch (err) {
      setCatError(err instanceof ApiError ? err.message : 'Erro ao criar categoria.');
    }
  }

  async function removeCategory(id: string) {
    if (!confirm('Excluir esta categoria? Os lançamentos ficarão sem categoria.')) return;
    await api.deleteCategory(id);
    await loadCategories();
    onCategoriesChanged();
  }

  // --- Telegram ---
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const loadTelegramStatus = useCallback(async () => {
    try {
      setTelegramStatus(await api.getTelegramStatus());
    } catch {
      setTelegramStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadTelegramStatus();
  }, [loadTelegramStatus]);

  async function generatePairCode() {
    setTelegramError(null);
    try {
      const res = await api.pairTelegram();
      setPairCode(res.code);
    } catch (err) {
      setTelegramError(err instanceof ApiError ? err.message : 'Erro ao gerar código.');
    }
  }

  async function unlinkTelegram() {
    setTelegramError(null);
    try {
      await api.unlinkTelegram();
      setPairCode(null);
      await loadTelegramStatus();
    } catch (err) {
      setTelegramError(err instanceof ApiError ? err.message : 'Erro ao desvincular.');
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">Gerenciar</h2>

          <section className="manage-section">
            <h3 className="section-title">Orçamento mensal</h3>
            <p className="hint">
              Orçamento de {monthName(month)}/{year}.{' '}
              {savedBudget > 0 && (
                <>
                  Atual: <strong>{formatCurrency(savedBudget)}</strong>.
                </>
              )}
            </p>
            <form onSubmit={saveBudget} className="inline-form">
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Ex.: 3000"
              />
              <button type="submit" className="btn-primary">
                Salvar
              </button>
            </form>
            {budgetMsg && <div className="alert alert-success">{budgetMsg}</div>}
            {budgetError && <div className="alert alert-error">{budgetError}</div>}
          </section>

          <section className="manage-section">
            <h3 className="section-title">Categorias</h3>
            <form onSubmit={addCategory} className="cat-form">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nova categoria"
                maxLength={60}
                required
              />
              <div className="palette">
                {PALETTE.map((c) => (
                  <motion.button
                    type="button"
                    key={c}
                    className={`swatch ${newColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                    aria-label={`Cor ${c}`}
                    whileTap={{ scale: 0.85 }}
                    transition={springTap}
                  />
                ))}
              </div>
              <motion.button
                type="submit"
                className="btn-primary btn-sm"
                whileTap={{ scale: 0.95 }}
                transition={springTap}
              >
                Adicionar
              </motion.button>
            </form>
            {catError && <div className="alert alert-error">{catError}</div>}

            {categories.length === 0 ? (
              <p className="empty">Nenhuma categoria cadastrada.</p>
            ) : (
              <ul className="settings-cat-list">
                <AnimatePresence initial={false}>
                  {categories.map((c) => (
                    <motion.li
                      key={c.id}
                      className="settings-cat-row"
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={springSmooth}
                      style={{ overflow: 'hidden' }}
                    >
                      <span className="cat-dot" style={{ background: c.color }} />
                      <span className="cat-name">{c.name}</span>
                      <button className="icon-btn" title="Excluir" onClick={() => removeCategory(c.id)}>
                        <TrashIcon />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section className="manage-section">
            <h3 className="section-title">Telegram</h3>
            {!telegramStatus ? (
              <p className="hint">Carregando...</p>
            ) : !telegramStatus.enabled ? (
              <p className="hint">Integração com Telegram não configurada no servidor.</p>
            ) : telegramStatus.linked ? (
              <>
                <p className="hint">✅ Conectado. Você pode lançar gastos/receitas e tirar dúvidas pelo bot.</p>
                <button type="button" className="btn-ghost btn-sm" onClick={unlinkTelegram}>
                  Desvincular
                </button>
              </>
            ) : (
              <>
                <p className="hint">
                  Gere um código e envie para{' '}
                  {telegramStatus.botUsername ? <strong>@{telegramStatus.botUsername}</strong> : 'o bot'} no Telegram
                  para lançar gastos e receitas por mensagem.
                </p>
                {pairCode ? (
                  <p className="hint">
                    Envie no Telegram: <strong>/start {pairCode}</strong>
                    <br />
                    (código válido por 10 minutos)
                  </p>
                ) : (
                  <motion.button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={generatePairCode}
                    whileTap={{ scale: 0.95 }}
                    transition={springTap}
                  >
                    Gerar código
                  </motion.button>
                )}
              </>
            )}
            {telegramError && <div className="alert alert-error">{telegramError}</div>}
          </section>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={close}>
              Fechar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
