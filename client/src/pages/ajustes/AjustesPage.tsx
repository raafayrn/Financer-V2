import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Account, Category } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { useMonth } from '../../context/MonthContext';
import { useTheme } from '../../context/ThemeContext';
import { ManageModal } from '../../components/ManageModal';
import { MoonIcon, SunIcon } from '../../components/icons';
import { CLASS_SCHEDULE } from '../../lib/studies';
import { DATA_COLORS } from '../../utils/palette';

const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
};

/** Linha de configuração: descrição à esquerda, ação à direita. */
function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ms-row">
      <span className="ms-row-name">
        {title}
        {hint && <span className="ms-row-sub">{hint}</span>}
      </span>
      <span className="ms-row-actions ms-row-actions-fixed">{children}</span>
    </div>
  );
}

/**
 * Ajustes reúne o que é configuração e não uso diário: tema, categorias e
 * contas, e os atalhos para o que virou tela própria (despesas fixas e
 * matérias). Fica fora da navegação principal, na engrenagem da sidebar.
 */
export function AjustesPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { year, month } = useMonth();
  const [manageOpen, setManageOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [, setAccounts] = useState<Account[]>([]);
  const [recoloring, setRecoloring] = useState(false);

  const loadRefs = useCallback(async () => {
    const [cats, accs] = await Promise.all([api.listCategories(), api.listAccounts()]);
    setCategories(cats);
    setAccounts(accs);
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

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
    <div className="ms-grid-main-side">
      <div className="ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Aparência</h3>
          </div>
          <Row title="Tema" hint={theme === 'dark' ? 'Escuro (cozy)' : 'Claro'}>
            <button className="ms-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {theme === 'dark' ? 'Usar claro' : 'Usar escuro'}
            </button>
          </Row>
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Finanças</h3>
          </div>
          <Row title="Categorias e contas" hint="Nomes, cores e onde o dinheiro sai">
            <button className="ms-btn" onClick={() => setManageOpen(true)}>
              Abrir
            </button>
          </Row>
          <Row title="Despesas fixas" hint="Lançamentos que se repetem todo mês">
            <Link className="ms-btn" to="/financas/recorrentes">
              Abrir
            </Link>
          </Row>

          {/* As cores das categorias ficam gravadas no banco, então trocar a
              paleta do app não alcança as que já existem: elas seguem com os
              tons saturados originais. A recoloração é explícita porque foi o
              usuário quem escolheu essas cores. */}
          {outdated.length > 0 && (
            <Row
              title="Recolorir categorias"
              hint={`${outdated.length} categoria${outdated.length > 1 ? 's usam' : ' usa'} cores de fora da paleta atual`}
            >
              <button className="ms-btn" onClick={() => void recolor()} disabled={recoloring}>
                {recoloring ? 'Aplicando…' : 'Aplicar paleta'}
              </button>
            </Row>
          )}
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Estudos</h3>
          </div>
          <Row title="Matérias e assuntos" hint="Progresso do semestre">
            <Link className="ms-btn" to="/estudos/materias">
              Abrir
            </Link>
          </Row>
        </section>
      </div>

      <div className="ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <div>
              <h3 className="ms-card-title">Grade de aulas</h3>
              <span className="ms-muted">Definida em src/lib/studies.ts</span>
            </div>
          </div>
          {weekdays.map((d) => (
            <div key={d} className="ms-row">
              <span className="ms-row-time">{WEEKDAY_LABEL[d]}</span>
              <span className="ms-row-name">
                {CLASS_SCHEDULE[d].map((c) => (
                  <span key={c.time} className="ms-schedule-class">
                    <span className="ms-row-sub">{c.time}</span>
                    {c.name}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>

        <section className="ms-card">
          <div className="ms-card-body">
            <span className="ms-label">Conta</span>
            <p className="ms-muted" style={{ margin: '4px 0 0' }}>
              {user?.name} — o app entra sozinho nesta conta, sem tela de login.
            </p>
          </div>
        </section>
      </div>

      {manageOpen && (
        <ManageModal
          year={year}
          month={month}
          onCancel={() => setManageOpen(false)}
          onCategoriesChanged={() => void loadRefs()}
        />
      )}
    </div>
  );
}
