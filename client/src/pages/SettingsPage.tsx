import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Category } from '../api/types';
import { useMonth } from '../context/MonthContext';
import { MonthNavigator } from '../components/MonthNavigator';
import { formatCurrency, monthName } from '../utils/format';

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

export function SettingsPage() {
  const { year, month } = useMonth();

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

  // --- Salário fixo do mês ---
  const [salary, setSalary] = useState('');
  const [savedSalary, setSavedSalary] = useState(0);
  const [salaryMsg, setSalaryMsg] = useState<string | null>(null);
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const loadSalary = useCallback(async () => {
    const s = await api.getSalary(year, month);
    setSavedSalary(s.amount);
    setSalary(s.amount > 0 ? String(s.amount) : '');
  }, [year, month]);

  useEffect(() => {
    void loadSalary();
  }, [loadSalary]);

  async function saveSalary(e: FormEvent) {
    e.preventDefault();
    setSalaryMsg(null);
    setSalaryError(null);
    const value = Number(salary.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setSalaryError('Informe um valor maior que zero.');
      return;
    }
    try {
      const res = await api.setSalary(year, month, value);
      setSavedSalary(res.amount);
      setSalaryMsg('Salário salvo!');
    } catch (err) {
      setSalaryError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
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
    } catch (err) {
      setCatError(err instanceof ApiError ? err.message : 'Erro ao criar categoria.');
    }
  }

  async function removeCategory(id: string) {
    if (!confirm('Excluir esta categoria? Os lançamentos ficarão sem categoria.')) return;
    await api.deleteCategory(id);
    await loadCategories();
  }

  return (
    <div className="page">
      <h2 className="page-title">Ajustes</h2>

      <section className="card">
        <MonthNavigator />
      </section>

      <section className="card">
        <h3 className="section-title">Salário fixo</h3>
        <p className="hint">
          Salário de {monthName(month)}/{year}.{' '}
          {savedSalary > 0 && <>Atual: <strong>{formatCurrency(savedSalary)}</strong>.</>}
        </p>
        <form onSubmit={saveSalary} className="inline-form">
          <input
            type="text"
            inputMode="decimal"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="Ex.: 4200"
          />
          <button type="submit" className="btn-primary">
            Salvar
          </button>
        </form>
        {salaryMsg && <div className="alert alert-success">{salaryMsg}</div>}
        {salaryError && <div className="alert alert-error">{salaryError}</div>}
      </section>

      <section className="card">
        <h3 className="section-title">Orçamento mensal</h3>
        <p className="hint">
          Orçamento de {monthName(month)}/{year}.{' '}
          {savedBudget > 0 && <>Atual: <strong>{formatCurrency(savedBudget)}</strong>.</>}
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

      <section className="card">
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
              <button
                type="button"
                key={c}
                className={`swatch ${newColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
          <button type="submit" className="btn-primary btn-sm">
            Adicionar
          </button>
        </form>
        {catError && <div className="alert alert-error">{catError}</div>}

        {categories.length === 0 ? (
          <p className="empty">Nenhuma categoria cadastrada.</p>
        ) : (
          <ul className="settings-cat-list">
            {categories.map((c) => (
              <li key={c.id} className="settings-cat-row">
                <span className="cat-dot" style={{ background: c.color }} />
                <span className="cat-name">{c.name}</span>
                <button className="icon-btn" title="Excluir" onClick={() => removeCategory(c.id)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
