import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AgendaEvent, AgendaEventCategory, Exam, StudiesOverview, StudyTask, Subject } from '../api/types';
import { formatDayMonth } from '../utils/format';
import { EditIcon, TrashIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { AgendaEventModal, ExamModal, StudyTaskModal } from '../components/StudyModals';
import { springSmooth } from '../lib/motion';
import { AGENDA_CATEGORY_COLORS, AGENDA_CATEGORY_LABELS } from '../utils/palette';
import { CLASS_SCHEDULE } from '../utils/schedule';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS_LONG = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const WEEKDAYS_FULL = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];

/** As antigas abas Provas/Tarefas viraram filtros da mesma lista. */
type StudiesFilter = 'tudo' | 'provas' | 'tarefas' | 'eventos';

/** Prova, tarefa e evento normalizados para a lista única de "Próximos". */
interface AgendaItem {
  kind: 'prova' | 'tarefa' | 'evento';
  id: string;
  title: string;
  date: string | null;
  subject?: Subject;
  color?: string;
  exam?: Exam;
  task?: StudyTask;
  event?: AgendaEvent;
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function countdownLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return `há ${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''}`;
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `Faltam ${d} dias`;
}

function todayIsoStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const CATEGORY_COLORS = AGENDA_CATEGORY_COLORS;
const CATEGORY_LABELS = AGENDA_CATEGORY_LABELS;

// ─── CALENDÁRIO AGENDA ────────────────────────────────────────────────────────
interface AgendaCalendarProps {
  exams: Exam[];
  tasks: StudyTask[];
  subjects: Subject[];
  events: AgendaEvent[];
  onExamEdit: (exam: Exam) => void;
  onTaskEdit: (task: StudyTask) => void;
  onEventEdit: (event: AgendaEvent) => void;
  onAddEvent: (date: string) => void;
  onDeleteEvent: (id: string) => void;
}

function AgendaCalendar({ exams, tasks, subjects, events, onExamEdit, onTaskEdit, onEventEdit, onAddEvent, onDeleteEvent }: AgendaCalendarProps) {
  const today = new Date();
  const [cal, setCal] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedIso, setSelectedIso] = useState<string>(todayIsoStr());

  const todayStr = todayIsoStr();

  function goToday() {
    setCal({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedIso(todayStr);
  }
  function prev() {
    setCal((c) => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  }
  function next() {
    setCal((c) => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  }

  const firstDay = new Date(cal.year, cal.month, 1).getDay();
  const daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate();

  function isoOf(day: number) {
    return `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const subjectById = (id: string | null) => subjects.find((s) => s.id === id);
  const subjectByName = (name: string) => subjects.find((s) => s.name === name);

  function classesForIso(iso: string) {
    const dow = new Date(iso + 'T00:00:00').getDay(); // 0=Dom
    return CLASS_SCHEDULE[dow] ?? [];
  }

  function eventsForDay(iso: string) {
    const dayExams = exams.filter((e) => e.date === iso);
    const dayTasks = tasks.filter((t) => t.dueDate === iso);
    const dayClasses = classesForIso(iso);
    const dayEvents = events.filter((ev) => ev.date === iso);
    return { dayExams, dayTasks, dayClasses, dayEvents };
  }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selDate = selectedIso ? new Date(selectedIso + 'T00:00:00') : null;
  const { dayExams: selExams, dayTasks: selTasks, dayClasses: selClasses, dayEvents: selEvents } = eventsForDay(selectedIso);

  const upcomingExams = [...exams]
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="agenda-layout">
      {/* Calendário principal */}
      <div className="agenda-main">
        <div className="agenda-cal-header">
          <h2 className="agenda-cal-month">
            {MONTHS_PT[cal.month]} De {cal.year}
          </h2>
          <div className="agenda-cal-nav">
            <button className="agenda-nav-btn agenda-today-btn" onClick={goToday}>Hoje</button>
            <button className="agenda-nav-btn agenda-arrow" onClick={prev}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="agenda-nav-btn agenda-arrow" onClick={next}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <div className="agenda-grid">
          {WEEKDAYS_LONG.map((w) => (
            <div key={w} className="agenda-weekday">{w}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="agenda-cell agenda-cell-empty" />;
            const iso = isoOf(day);
            const { dayExams, dayTasks, dayClasses, dayEvents } = eventsForDay(iso);
            const isToday = iso === todayStr;
            const isSel = iso === selectedIso;
            const MAX_VISIBLE = 3;
            const allEvents = [
              ...dayEvents.map((ev) => ({ kind: 'event' as const, label: ev.title, color: CATEGORY_COLORS[ev.category], id: ev.id })),
              ...dayExams.map((e) => {
                const subj = subjectById(e.subjectId);
                return { kind: 'exam' as const, label: subj ? `${subj.name} — ${e.title}` : e.title, color: subj?.color ?? 'var(--over)', id: e.id };
              }),
              ...dayTasks.map((t) => ({ kind: 'task' as const, label: t.title, color: 'var(--primary)', id: t.id })),
              ...dayClasses.map((c, ci) => {
                const subj = subjectByName(c.name);
                return { kind: 'class' as const, label: c.name, color: subj?.color ? subj.color + 'aa' : 'var(--surface-2)', id: `class-${iso}-${ci}` };
              }),
            ];
            const overflow = allEvents.length - MAX_VISIBLE;
            return (
              <div
                key={i}
                className={`agenda-cell${isToday ? ' agenda-today' : ''}${isSel ? ' agenda-selected' : ''}`}
                onClick={() => setSelectedIso(iso)}
              >
                <span className={`agenda-day-num${isToday ? ' agenda-day-num-today' : ''}`}>{day}</span>
                <div className="agenda-events">
                  {allEvents.slice(0, MAX_VISIBLE).map((ev) => (
                    <div
                      key={ev.id}
                      className={`agenda-event-pill${ev.kind === 'class' ? ' agenda-event-class' : ''}`}
                      style={{ background: ev.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ev.kind === 'event') onEventEdit(events.find((x) => x.id === ev.id)!);
                        else if (ev.kind === 'exam') onExamEdit(exams.find((x) => x.id === ev.id)!);
                        else if (ev.kind === 'task') onTaskEdit(tasks.find((x) => x.id === ev.id)!);
                      }}
                    >
                      {ev.label}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="agenda-event-more">+{overflow}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar */}
      <div className="agenda-sidebar">
        {selDate && (
          <div className="agenda-sidebar-date">
            <span className="agenda-sidebar-weekday">{WEEKDAYS_FULL[selDate.getDay()]}</span>
            <span className="agenda-sidebar-day">{selDate.getDate()} De {MONTHS_PT[selDate.getMonth()]}</span>
          </div>
        )}

        <div className="agenda-sidebar-section">
          <div className="agenda-sidebar-head">
            <span className="agenda-sidebar-label">Agenda do dia</span>
            <button className="btn-primary btn-sm" onClick={() => onAddEvent(selectedIso)}>+ Evento</button>
          </div>
          {selEvents.length === 0 && selExams.length === 0 && selTasks.length === 0 && selClasses.length === 0 ? (
            <p className="agenda-sidebar-empty">Nenhum evento.</p>
          ) : (
            <div className="agenda-sidebar-events">
              {selEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="agenda-sidebar-event"
                  style={{ borderLeftColor: CATEGORY_COLORS[ev.category], cursor: 'pointer' }}
                  onClick={() => onEventEdit(ev)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                      <span className="agenda-sidebar-event-label">
                        {CATEGORY_LABELS[ev.category]}{ev.time ? ` · ${ev.time}` : ''}
                      </span>
                      <span className="agenda-sidebar-event-title">{ev.title}</span>
                      {ev.notes && <span className="agenda-sidebar-event-sub">{ev.notes}</span>}
                    </div>
                    <button
                      className="icon-btn"
                      title="Excluir"
                      onClick={(e) => { e.stopPropagation(); void onDeleteEvent(ev.id); }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
              {selClasses.map((c, ci) => {
                const subj = subjectByName(c.name);
                return (
                  <div key={`class-${ci}`} className="agenda-sidebar-event" style={{ borderLeftColor: subj?.color ?? 'var(--text-muted)' }}>
                    <span className="agenda-sidebar-event-label">{c.time}</span>
                    <span className="agenda-sidebar-event-title">{c.name}</span>
                  </div>
                );
              })}
              {selExams.map((ex) => {
                const subj = subjectById(ex.subjectId);
                return (
                  <div key={ex.id} className="agenda-sidebar-event exam-sidebar" style={{ borderLeftColor: subj?.color ?? 'var(--over)' }} onClick={() => onExamEdit(ex)}>
                    <span className="agenda-sidebar-event-label">Prova</span>
                    <span className="agenda-sidebar-event-title">{ex.title}</span>
                    {subj && <span className="agenda-sidebar-event-sub">{subj.name}</span>}
                  </div>
                );
              })}
              {selTasks.map((t) => {
                const subj = subjectById(t.subjectId);
                return (
                  <div key={t.id} className="agenda-sidebar-event task-sidebar" onClick={() => onTaskEdit(t)}>
                    <span className="agenda-sidebar-event-label">Tarefa</span>
                    <span className="agenda-sidebar-event-title">{t.title}</span>
                    {subj && <span className="agenda-sidebar-event-sub">{subj.name}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {upcomingExams.length > 0 && (
          <div className="agenda-sidebar-section">
            <div className="agenda-sidebar-head">
              <span className="agenda-sidebar-label">Próximas Provas</span>
            </div>
            <div className="agenda-sidebar-events">
              {upcomingExams.map((ex) => {
                const subj = subjectById(ex.subjectId);
                return (
                  <div key={ex.id} className="agenda-upcoming-exam" onClick={() => onExamEdit(ex)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                      {subj && <span style={{ fontSize: '0.7rem', color: subj.color, fontWeight: 600 }}>{subj.name}</span>}
                      <span className="agenda-upcoming-title">{ex.title}</span>
                    </div>
                    <span className="agenda-upcoming-countdown">{daysUntil(ex.date) === 0 ? 'Hoje' : `${daysUntil(ex.date)}d`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export function EstudosPage() {
  const [data, setData] = useState<StudiesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StudiesFilter>('tudo');

  const [examModal, setExamModal] = useState<{ exam?: Exam } | null>(null);
  const [taskModal, setTaskModal] = useState<{ task?: StudyTask } | null>(null);
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [eventModal, setEventModal] = useState<{ event?: AgendaEvent; defaultDate?: string } | null>(null);

  // O "+" global chega aqui por query param e abre o formulário certo.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const intent = searchParams.get('new');
    if (intent === 'task') setTaskModal({});
    else if (intent === 'event') setEventModal({});
    if (intent) {
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadRef.current;
    setError(null);
    try {
      const [d, evs] = await Promise.all([api.getStudiesOverview(), api.listAgendaEvents()]);
      if (id !== loadRef.current) return;
      setData(d);
      setAgendaEvents(evs);
    } catch (err) {
      if (id !== loadRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (id === loadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const subjects: Subject[] = data?.subjects ?? [];

  // O cadastro de matérias saiu daqui: virou <SubjectsManager /> em Ajustes.
  async function toggleTask(id: string, done: boolean) {
    await api.updateStudyTask(id, { done });
    await load();
  }
  async function deleteTask(id: string) {
    await api.deleteStudyTask(id);
    await load();
  }
  async function deleteExam(id: string) {
    if (!confirm('Excluir esta prova?')) return;
    await api.deleteExam(id);
    await load();
  }
  async function saveEvent(d: { title: string; date: string; time: string | null; notes: string | null; category: AgendaEventCategory }) {
    if (eventModal?.event) await api.updateAgendaEvent(eventModal.event.id, d);
    else await api.createAgendaEvent(d);
    setEventModal(null);
    await load();
  }
  async function deleteEvent(id: string) {
    await api.deleteAgendaEvent(id);
    await load();
  }

  async function saveExam(d: { title: string; date: string; subjectId: string | null; notes: string | null }) {
    if (examModal?.exam) await api.updateExam(examModal.exam.id, d);
    else await api.createExam(d);
    setExamModal(null);
    await load();
  }
  async function saveTask(d: { title: string; dueDate: string | null; subjectId: string | null }) {
    if (taskModal?.task) await api.updateStudyTask(taskModal.task.id, d);
    else await api.createStudyTask(d);
    setTaskModal(null);
    await load();
  }

  const subjectById = (id: string | null) => subjects.find((s) => s.id === id);

  const FILTERS: { id: StudiesFilter; label: string }[] = [
    { id: 'tudo', label: 'Tudo' },
    { id: 'provas', label: 'Provas' },
    { id: 'tarefas', label: 'Tarefas' },
    { id: 'eventos', label: 'Eventos' },
  ];

  // Provas, tarefas e eventos são o mesmo objeto — item com data — e estavam
  // espalhados em três abas. Aqui viram uma lista só, ordenada por urgência.
  const items: AgendaItem[] = [];
  if (data) {
    if (filter === 'tudo' || filter === 'provas') {
      for (const ex of data.upcomingExams) {
        items.push({ kind: 'prova', id: ex.id, title: ex.title, date: ex.date, subject: subjectById(ex.subjectId), exam: ex });
      }
    }
    if (filter === 'tudo' || filter === 'tarefas') {
      for (const t of data.pendingTasks) {
        items.push({ kind: 'tarefa', id: t.id, title: t.title, date: t.dueDate, subject: subjectById(t.subjectId), task: t });
      }
    }
    if (filter === 'tudo' || filter === 'eventos') {
      for (const ev of agendaEvents) {
        items.push({ kind: 'evento', id: ev.id, title: ev.title, date: ev.date, color: CATEGORY_COLORS[ev.category], event: ev });
      }
    }
  }
  items.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return (
    <div className="page">
      <PageHeader title="Estudos" subtitle="Agenda, provas e entregas" />

      {loading && !data ? (
        <div className="center-pad"><div className="spinner" /></div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : data ? (
        <div className="dashboard-stack">
          <AgendaCalendar
            exams={filter === 'tudo' || filter === 'provas' ? data.upcomingExams : []}
            tasks={filter === 'tudo' || filter === 'tarefas' ? data.pendingTasks : []}
            subjects={subjects}
            events={filter === 'tudo' || filter === 'eventos' ? agendaEvents : []}
            onExamEdit={(ex) => setExamModal({ exam: ex })}
            onTaskEdit={(t) => setTaskModal({ task: t })}
            onEventEdit={(ev) => setEventModal({ event: ev })}
            onAddEvent={(date) => setEventModal({ defaultDate: date })}
            onDeleteEvent={deleteEvent}
          />

          <section className="card">
            <div className="section-head">
              <h3 className="section-title">Próximos ({items.length})</h3>
              <div className="section-head-actions">
                <button className="btn-ghost btn-sm" onClick={() => setExamModal({})}>+ Prova</button>
                <button className="btn-ghost btn-sm" onClick={() => setTaskModal({})}>+ Tarefa</button>
                <button className="btn-primary btn-sm" onClick={() => setEventModal({})}>+ Evento</button>
              </div>
            </div>

            <div className="chip-row">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`chip${filter === f.id ? ' chip-active' : ''}`}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {items.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">Nada por aqui</p>
                <p className="empty-state-text">
                  {filter === 'tudo' ? 'Sem provas, tarefas ou eventos pendentes.' : 'Nenhum item deste tipo.'}
                </p>
              </div>
            ) : (
              <ul className="agenda-item-list">
                <AnimatePresence initial={false}>
                  {items.map((it) => {
                    const days = it.date ? daysUntil(it.date) : null;
                    const overdue = days !== null && days < 0;
                    const urgent = days !== null && days >= 0 && days <= 3;
                    const accent = it.subject?.color ?? it.color ?? 'var(--border-strong)';
                    return (
                      <motion.li
                        key={`${it.kind}-${it.id}`}
                        className="agenda-item"
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={springSmooth}
                        style={{ overflow: 'hidden' }}
                      >
                        <span className="agenda-item-accent" style={{ background: accent }} />
                        {it.kind === 'tarefa' ? (
                          <button className="check-box" onClick={() => toggleTask(it.id, true)} title="Concluir" />
                        ) : (
                          <span className="agenda-item-kind">{it.kind === 'prova' ? 'Prova' : 'Evento'}</span>
                        )}
                        <div className="agenda-item-main">
                          <span className="agenda-item-title">{it.title}</span>
                          <span className="agenda-item-meta">
                            {it.subject?.name}
                            {it.subject && it.date ? ' · ' : ''}
                            {it.date && formatDayMonth(it.date)}
                          </span>
                        </div>
                        {days !== null && (
                          <span className={`countdown-chip${overdue ? ' over' : urgent ? ' urgent' : ''}`}>
                            {overdue ? 'Atrasada' : countdownLabel(it.date!)}
                          </span>
                        )}
                        <div className="exp-actions">
                          <button
                            className="icon-btn"
                            title="Editar"
                            onClick={() => {
                              if (it.exam) setExamModal({ exam: it.exam });
                              else if (it.task) setTaskModal({ task: it.task });
                              else if (it.event) setEventModal({ event: it.event });
                            }}
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="icon-btn"
                            title="Excluir"
                            onClick={() => {
                              if (it.exam) void deleteExam(it.id);
                              else if (it.task) void deleteTask(it.id);
                              else void deleteEvent(it.id);
                            }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {eventModal && (
        <AgendaEventModal
          initial={eventModal.event}
          defaultDate={eventModal.defaultDate}
          onCancel={() => setEventModal(null)}
          onSubmit={saveEvent}
        />
      )}
      {examModal && (
        <ExamModal subjects={subjects} initial={examModal.exam} onCancel={() => setExamModal(null)} onSubmit={saveExam} />
      )}
      {taskModal && (
        <StudyTaskModal subjects={subjects} initial={taskModal.task} onCancel={() => setTaskModal(null)} onSubmit={saveTask} />
      )}
    </div>
  );
}
