import { useState } from 'react';
import { api } from '../../api/client';
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '../../components/icons';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  MONTHS_PT,
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  classesForIso,
  daysUntil,
  todayIsoStr,
} from '../../lib/studies';
import { useEstudos } from '../estudos/context';

/** Quantos itens cabem numa célula antes de virar "+N". */
const MAX_VISIBLE = 3;

export function AgendaPage() {
  const { data, subjects, events, subjectById, openExam, openTask, openEvent, reload } =
    useEstudos();

  const today = new Date();
  const todayStr = todayIsoStr();
  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedIso, setSelectedIso] = useState<string>(todayStr);

  const exams = data.upcomingExams;
  const tasks = data.pendingTasks;

  function goToday() {
    setCal({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedIso(todayStr);
  }
  function shift(delta: number) {
    setCal((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  async function deleteEvent(id: string) {
    await api.deleteAgendaEvent(id);
    await reload();
  }

  const firstDay = new Date(cal.year, cal.month, 1).getDay();
  const daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate();

  function isoOf(day: number) {
    return `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const subjectByName = (name: string) => subjects.find((s) => s.name === name);

  /** Tudo que acontece num dia: eventos, provas, tarefas e aulas fixas. */
  function itemsForDay(iso: string) {
    return {
      dayEvents: events.filter((ev) => ev.date === iso),
      dayExams: exams.filter((e) => e.date === iso),
      dayTasks: tasks.filter((t) => t.dueDate === iso),
      dayClasses: classesForIso(iso),
    };
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selDate = new Date(selectedIso + 'T00:00:00');
  const { dayEvents: selEvents, dayExams: selExams, dayTasks: selTasks, dayClasses: selClasses } =
    itemsForDay(selectedIso);
  const selEmpty =
    selEvents.length === 0 && selExams.length === 0 && selTasks.length === 0 && selClasses.length === 0;

  const upcomingExams = [...exams]
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="ms-agenda-layout">
      <section className="ms-card ms-agenda-cal">
        <div className="ms-card-head">
          <h3 className="ms-card-title">
            {MONTHS_PT[cal.month]} de {cal.year}
          </h3>
          <div className="ms-card-actions">
            <button className="ms-btn" onClick={goToday}>
              Hoje
            </button>
            <button className="ms-icon-btn" aria-label="Mês anterior" onClick={() => shift(-1)}>
              <ChevronLeftIcon />
            </button>
            <button className="ms-icon-btn" aria-label="Próximo mês" onClick={() => shift(1)}>
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="ms-cal-grid">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="ms-cal-weekday">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="ms-cal-cell empty" />;
            const iso = isoOf(day);
            const { dayEvents, dayExams, dayTasks, dayClasses } = itemsForDay(iso);
            const isToday = iso === todayStr;
            const isSel = iso === selectedIso;

            const pills = [
              ...dayEvents.map((ev) => ({
                key: `ev-${ev.id}`,
                label: ev.title,
                color: CATEGORY_COLORS[ev.category],
                onClick: () => openEvent(ev),
              })),
              ...dayExams.map((e) => {
                const subj = subjectById(e.subjectId);
                return {
                  key: `ex-${e.id}`,
                  label: subj ? `${subj.name} — ${e.title}` : e.title,
                  color: subj?.color ?? 'var(--over)',
                  onClick: () => openExam(e),
                };
              }),
              ...dayTasks.map((t) => ({
                key: `tk-${t.id}`,
                label: t.title,
                color: 'var(--primary)',
                onClick: () => openTask(t),
              })),
              ...dayClasses.map((c, ci) => ({
                key: `cl-${iso}-${ci}`,
                label: c.name,
                color: subjectByName(c.name)?.color ?? '#9a9aa0',
                muted: true,
                onClick: undefined,
              })),
            ];
            const overflow = pills.length - MAX_VISIBLE;

            return (
              <div
                key={i}
                className={`ms-cal-cell${isToday ? ' today' : ''}${isSel ? ' selected' : ''}`}
                onClick={() => setSelectedIso(iso)}
              >
                <span className="ms-cal-daynum">{day}</span>
                <div className="ms-cal-pills">
                  {pills.slice(0, MAX_VISIBLE).map((p) => (
                    <button
                      key={p.key}
                      className={`ms-cal-pill${'muted' in p && p.muted ? ' muted' : ''}`}
                      style={
                        'muted' in p && p.muted
                          ? { color: p.color, borderColor: p.color }
                          : { background: p.color }
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onClick?.();
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {overflow > 0 && <span className="ms-cal-more">+{overflow}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <div>
              <h3 className="ms-card-title">{selDate.getDate()} de {MONTHS_PT[selDate.getMonth()]}</h3>
              <span className="ms-muted">{WEEKDAYS_FULL[selDate.getDay()]}</span>
            </div>
            <div className="ms-card-actions">
              <button
                className="ms-btn ms-btn-primary"
                onClick={() => openEvent(undefined, selectedIso)}
              >
                + Evento
              </button>
            </div>
          </div>

          {selEmpty ? (
            <p className="empty">Nenhum compromisso neste dia.</p>
          ) : (
            <>
              {selClasses.map((c, ci) => {
                const subj = subjectByName(c.name);
                return (
                  <div key={`cl-${ci}`} className="ms-row">
                    <span className="ms-row-time">{c.time}</span>
                    <span className="ms-row-name">
                      {c.name}
                      <span className="ms-row-sub">Aula</span>
                    </span>
                    {subj && (
                      <span
                        className="ms-legend-dot"
                        style={{ margin: 0, background: subj.color }}
                      />
                    )}
                  </div>
                );
              })}
              {selEvents.map((ev) => (
                <div key={ev.id} className="ms-row" onClick={() => openEvent(ev)}>
                  <span className="ms-row-time">{ev.time ?? '—'}</span>
                  <span className="ms-row-name">
                    {ev.title}
                    <span className="ms-row-sub">
                      {CATEGORY_LABELS[ev.category]}
                      {ev.notes ? ` · ${ev.notes}` : ''}
                    </span>
                  </span>
                  <span className="ms-row-actions">
                    <button
                      className="ms-icon-btn"
                      title="Excluir"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteEvent(ev.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
              ))}
              {selExams.map((ex) => {
                const subj = subjectById(ex.subjectId);
                return (
                  <div key={ex.id} className="ms-row" onClick={() => openExam(ex)}>
                    <span className="ms-row-time">Prova</span>
                    <span className="ms-row-name">
                      {ex.title}
                      <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                    </span>
                  </div>
                );
              })}
              {selTasks.map((t) => {
                const subj = subjectById(t.subjectId);
                return (
                  <div key={t.id} className="ms-row" onClick={() => openTask(t)}>
                    <span className="ms-row-time">Tarefa</span>
                    <span className="ms-row-name">
                      {t.title}
                      <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </section>

        {upcomingExams.length > 0 && (
          <section className="ms-card">
            <div className="ms-card-head">
              <h3 className="ms-card-title">Próximas provas</h3>
            </div>
            {upcomingExams.map((ex) => {
              const subj = subjectById(ex.subjectId);
              const d = daysUntil(ex.date);
              return (
                <div key={ex.id} className="ms-row" onClick={() => openExam(ex)}>
                  <span className="ms-row-name">
                    {ex.title}
                    <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                  </span>
                  <span className={`ms-chip${d <= 3 ? ' ms-chip-danger' : ''}`}>
                    {d === 0 ? 'Hoje' : `${d}d`}
                  </span>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
