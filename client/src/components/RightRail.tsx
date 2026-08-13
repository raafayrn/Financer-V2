import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AgendaEvent, Expense, StudiesOverview, Summary, WaterDay } from '../api/types';
import { useShell } from '../context/ShellContext';
import { formatCurrency, formatDayMonth, todayIso } from '../utils/format';

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

interface FocusItem {
  text: string;
  tone: 'over' | 'warning' | 'primary';
  to: string;
}

function formatMl(ml: number) {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1).replace('.', ',')} L`;
  return `${ml} ml`;
}

/**
 * Trilha de contexto do desktop. É onde os itens que interessam sempre —
 * "Foco de hoje", registrar, últimos lançamentos, próximo compromisso — ficam
 * visíveis sem depender da tela ativa.
 *
 * Puxa os próprios dados: existir só no shell não vale a pena impor que a Home
 * ou Finanças façam side channel para alimentá-la. O custo é uma requisição a
 * mais no login; o ganho é ela nunca ficar defasada.
 */
export function RightRail() {
  const navigate = useNavigate();
  const { refreshKey } = useShell();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [water, setWater] = useState<WaterDay | null>(null);
  const [studies, setStudies] = useState<StudiesOverview | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);

  const load = useCallback(async () => {
    const now = new Date();
    const [s, e, w, st, ev] = await Promise.all([
      api.getSummary(now.getFullYear(), now.getMonth() + 1),
      api.listExpenses(now.getFullYear(), now.getMonth() + 1),
      api.getWaterDay(todayIso()),
      api.getStudiesOverview(),
      api.listAgendaEvents(),
    ]);
    setSummary(s);
    setExpenses(e);
    setWater(w);
    setStudies(st);
    setEvents(ev);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load, refreshKey]);

  const focus: FocusItem[] = [];
  if (summary?.status === 'over') {
    focus.push({ text: 'Gastou mais do que ganhou este mês', tone: 'over', to: '/financas' });
  } else if (summary?.status === 'warning') {
    focus.push({ text: 'Perto de gastar toda a renda', tone: 'warning', to: '/financas' });
  }
  for (const t of studies?.pendingTasks ?? []) {
    if (t.dueDate && daysUntil(t.dueDate) < 0) {
      focus.push({ text: `Tarefa atrasada: ${t.title}`, tone: 'over', to: '/estudos' });
    }
  }
  for (const ex of studies?.upcomingExams ?? []) {
    const d = daysUntil(ex.date);
    if (d >= 0 && d <= 3) {
      focus.push({
        text: `${ex.title} ${d === 0 ? 'é hoje' : `em ${d} dia${d > 1 ? 's' : ''}`}`,
        tone: 'warning',
        to: '/estudos',
      });
    }
  }
  if (water && water.percent < 100) {
    focus.push({
      text: `Faltam ${formatMl(water.goalMl - water.consumedMl)} de água`,
      tone: 'primary',
      to: '/saude',
    });
  }

  const lastExpenses = [...expenses]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 4);

  const nextEvent =
    [...events]
      .filter((e) => daysUntil(e.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  return (
    <aside className="right-rail" aria-label="Contexto">
      <section className="rail-card">
        <span className="section-eyebrow">Foco de hoje</span>
        {focus.length === 0 ? (
          <p className="rail-empty">Tudo em dia.</p>
        ) : (
          <ul className="focus-list">
            {focus.slice(0, 4).map((f) => (
              <li key={f.text}>
                <button className={`focus-item focus-${f.tone}`} onClick={() => navigate(f.to)}>
                  <span className="focus-bullet" />
                  <span>{f.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rail-card">
        <div className="rail-card-head">
          <span className="section-eyebrow">Últimos gastos</span>
          <button className="link-btn" onClick={() => navigate('/financas')}>Ver todos</button>
        </div>
        {lastExpenses.length === 0 ? (
          <p className="rail-empty">Nada este mês.</p>
        ) : (
          <ul className="rail-list">
            {lastExpenses.map((e) => (
              <li key={e.id} className="rail-list-item">
                <div className="rail-list-main">
                  <span className="rail-list-title">{e.description}</span>
                  <span className="rail-list-meta">{formatDayMonth(e.date)}</span>
                </div>
                <span className="rail-list-value money neg">−{formatCurrency(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {nextEvent && (
        <section className="rail-card">
          <span className="section-eyebrow">Próximo compromisso</span>
          <button className="rail-event" onClick={() => navigate('/estudos')}>
            <span className="rail-event-title">{nextEvent.title}</span>
            <span className="rail-event-meta">
              {formatDayMonth(nextEvent.date)}
              {nextEvent.time ? ` · ${nextEvent.time}` : ''}
            </span>
          </button>
        </section>
      )}
    </aside>
  );
}
