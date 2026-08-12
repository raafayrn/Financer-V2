import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Account, Category } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useMonth } from '../context/MonthContext';
import { useTheme } from '../context/ThemeContext';
import { springTap } from '../lib/motion';
import { PageHeader } from '../components/PageHeader';
import { SubjectsManager } from '../components/SubjectsManager';
import { ManageModal } from '../components/ManageModal';
import { RecurringModal } from '../components/RecurringModal';
import { CLASS_SCHEDULE } from '../utils/schedule';
import { DATA_COLORS } from '../utils/palette';
import { MoonIcon, SunIcon } from '../components/icons';

const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
};

/**
 * Ajustes reúne o que é configuração e não uso diário: tema, matérias do
 * semestre, categorias/contas e despesas fixas. Tirar esses itens da navegação
 * principal foi o que permitiu o app cair para quatro seções.
 */
export function AjustesPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { year, month } = useMonth();
  const [modal, setModal] = useState<'none' | 'categorias' | 'fixas'>('none');
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Categorias e contas alimentam os dois modais desta tela.
  const loadRefs = useCallback(async () => {
    const [cats, accs] = await Promise.all([api.listCategories(), api.listAccounts()]);
    setCategories(cats);
    setAccounts(accs);
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const [recoloring, setRecoloring] = useState(false);

  /** Categorias cuja cor não pertence à paleta categórica atual. */
  const outdated = categories.filter((c) => !DATA_COLORS.includes((c.color ?? '').toLowerCase()));

  async function recolor() {
    setRecoloring(true);
    try {
      // Reatribui por posição, preservando a ordem — categorias vizinhas
      // continuam com cores distintas entre si.
      await Promise.all(
        categories.map((c, i) =>
          DATA_COLORS.includes((c.color ?? '').toLowerCase())
            ? null
            : api.updateCategory(c.id, { color: DATA_COLORS[i % DATA_COLORS.length] }),
        ),
      );
      await loadRefs();
    } finally {
      setRecoloring(false);
    }
  }

  const weekdays = Object.keys(CLASS_SCHEDULE).map(Number).sort();

  return (
    <div className="page">
      <PageHeader title="Ajustes" subtitle={user?.name ?? undefined} />

      <div className="settings-stack">
        <section className="card">
          <h3 className="section-title">Aparência</h3>
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>Tema</strong>
              <small>{theme === 'dark' ? 'Escuro' : 'Claro'}</small>
            </div>
            <motion.button
              className="btn-ghost btn-sm"
              onClick={toggleTheme}
              whileTap={{ scale: 0.95 }}
              transition={springTap}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {theme === 'dark' ? 'Usar claro' : 'Usar escuro'}
            </motion.button>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Finanças</h3>
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>Categorias e contas</strong>
              <small>Nomes, cores e onde o dinheiro sai</small>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setModal('categorias')}>Abrir</button>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <strong>Despesas fixas</strong>
              <small>Lançamentos que se repetem todo mês</small>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setModal('fixas')}>Abrir</button>
          </div>

          {/* As cores das categorias ficam gravadas no banco, então trocar a
              paleta do app não alcança as que já existem: elas seguem com os
              tons saturados originais, que destoam do tema bege. A recoloração
              é explícita porque é o usuário quem escolheu essas cores. */}
          {outdated.length > 0 && (
            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Recolorir categorias</strong>
                <small>
                  {outdated.length} categoria{outdated.length > 1 ? 's usam' : ' usa'} cores de fora da
                  paleta atual
                </small>
              </div>
              <button className="btn-ghost btn-sm" onClick={recolor} disabled={recoloring}>
                {recoloring ? 'Aplicando…' : 'Aplicar paleta'}
              </button>
            </div>
          )}
        </section>

        <SubjectsManager />

        <section className="card">
          <h3 className="section-title">Grade de aulas</h3>
          <p className="hint" style={{ marginBottom: 8 }}>
            Definida em <code>src/utils/schedule.ts</code> — fonte única, usada pela Home e pela Agenda.
          </p>
          <ul className="schedule-list">
            {weekdays.map((d) => (
              <li key={d} className="schedule-day">
                <span className="schedule-weekday">{WEEKDAY_LABEL[d]}</span>
                <span className="schedule-classes">
                  {CLASS_SCHEDULE[d].map((c) => (
                    <span key={c.time} className="schedule-class">
                      <span className="schedule-time num">{c.time}</span>
                      {c.name}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {modal === 'categorias' && (
        <ManageModal
          year={year}
          month={month}
          onCancel={() => setModal('none')}
          onCategoriesChanged={() => void loadRefs()}
        />
      )}
      {modal === 'fixas' && (
        <RecurringModal
          year={year}
          month={month}
          categories={categories}
          accounts={accounts}
          onCancel={() => setModal('none')}
          onChanged={() => void loadRefs()}
        />
      )}
    </div>
  );
}
