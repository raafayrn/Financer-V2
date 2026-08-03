import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { AgendaEvent, AgendaEventCategory, Exam, StudiesOverview, StudyTask, Subject } from '../api/types';
import { formatDayMonth } from '../utils/format';
import { CheckIcon, ChevronDownIcon, EditIcon, PlusIcon, TrashIcon } from '../components/icons';
import { AgendaEventModal, ExamModal, StudyTaskModal } from '../components/StudyModals';
import { springSmooth, springTap } from '../lib/motion';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS_LONG = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const WEEKDAYS_FULL = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];

type StudiesTab = 'agenda' | 'provas' | 'tarefas' | 'materias';

const overviewContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

const SUBJECT_COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#ff3b30'];

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

// Horário fixo semanal (1=Seg … 5=Sex)
const CLASS_SCHEDULE: Record<number, { time: string; name: string }[]> = {
  1: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  2: [
    { time: '18:55–20:35', name: 'Física Geral e Experimental II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  3: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Física Geral e Experimental II' },
  ],
  4: [
    { time: '18:55–20:35', name: 'Geometria e Álgebra Linear' },
    { time: '20:50–22:30', name: 'Introdução à Ciência dos Materiais' },
  ],
  5: [
    { time: '18:55–20:35', name: 'Desenho e Modelagem Geométrica' },
    { time: '20:50–22:30', name: 'Geometria e Álgebra Linear' },
  ],
};

const CATEGORY_COLORS: Record<AgendaEventCategory, string> = {
  CONSULTA: '#ff6b35',
  EVENTO: '#af52de',
  COMPROMISSO: '#007aff',
  LEMBRETE: '#ffcc00',
  OUTRO: '#8e8e93',
};

const CATEGORY_LABELS: Record<AgendaEventCategory, string> = {
  CONSULTA: 'Consulta',
  EVENTO: 'Evento',
  COMPROMISSO: 'Compromisso',
  LEMBRETE: 'Lembrete',
  OUTRO: 'Outro',
};

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
  const [tab, setTab] = useState<StudiesTab>('agenda');

  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});
  const [examModal, setExamModal] = useState<{ exam?: Exam } | null>(null);
  const [taskModal, setTaskModal] = useState<{ task?: StudyTask } | null>(null);
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
  const [eventModal, setEventModal] = useState<{ event?: AgendaEvent; defaultDate?: string } | null>(null);

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

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    if (!subjectName.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    await api.createSubject({ name: subjectName.trim(), color });
    setSubjectName('');
    setAddingSubject(false);
    await load();
  }
  async function deleteSubject(id: string) {
    if (!confirm('Excluir esta matéria e seus assuntos?')) return;
    await api.deleteSubject(id);
    await load();
  }
  async function addTopic(subjectId: string) {
    const name = (topicInputs[subjectId] ?? '').trim();
    if (!name) return;
    await api.addTopic(subjectId, { name });
    setTopicInputs((p) => ({ ...p, [subjectId]: '' }));
    await load();
  }
  async function toggleTopic(id: string, done: boolean) {
    await api.updateTopic(id, { done });
    await load();
  }
  async function deleteTopic(id: string) {
    await api.deleteTopic(id);
    await load();
  }
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

  const TABS: { id: StudiesTab; label: string }[] = [
    { id: 'agenda', label: 'Agenda' },
    { id: 'provas', label: 'Provas' },
    { id: 'tarefas', label: 'Tarefas' },
    { id: 'materias', label: 'Matérias' },
  ];

  return (
    <div className="page">
      <div className="estudos-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`estudos-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tab === t.id && <motion.span layoutId="estudos-tab-pill" className="estudos-tab-pill" transition={springSmooth} />}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="center-pad"><div className="spinner" /></div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : data ? (
        <>
          {/* ── AGENDA ── */}
          {tab === 'agenda' && (
            <AgendaCalendar
              exams={data.upcomingExams}
              tasks={data.pendingTasks}
              subjects={subjects}
              events={agendaEvents}
              onExamEdit={(ex) => setExamModal({ exam: ex })}
              onTaskEdit={(t) => setTaskModal({ task: t })}
              onEventEdit={(ev) => setEventModal({ event: ev })}
              onAddEvent={(date) => setEventModal({ defaultDate: date })}
              onDeleteEvent={deleteEvent}
            />
          )}

          {/* ── PROVAS ── */}
          {tab === 'provas' && (
            <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
              <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
                <div className="section-head">
                  <h3 className="section-title">Próximas provas</h3>
                  <motion.button className="btn-primary btn-sm" onClick={() => setExamModal({})} whileTap={{ scale: 0.95 }} transition={springTap}>
                    + Prova
                  </motion.button>
                </div>
                {data.upcomingExams.length === 0 ? (
                  <p className="empty">Nenhuma prova marcada.</p>
                ) : (
                  <div className="exam-list">
                    {data.upcomingExams.map((ex) => {
                      const subj = subjectById(ex.subjectId);
                      const d = daysUntil(ex.date);
                      const urgent = d <= 3;
                      return (
                        <div key={ex.id} className="exam-card" style={{ borderColor: subj?.color ?? 'var(--border)' }}>
                          <div className="exam-countdown" style={{ color: urgent ? 'var(--over)' : 'var(--primary)' }}>
                            {countdownLabel(ex.date)}
                          </div>
                          <div className="exam-title">{ex.title}</div>
                          <div className="exam-meta">
                            {subj && <span className="exam-subject" style={{ background: subj.color }}>{subj.name}</span>}
                            <span>{formatDayMonth(ex.date)}</span>
                          </div>
                          <div className="exam-actions">
                            <button className="icon-btn" title="Editar" onClick={() => setExamModal({ exam: ex })}><EditIcon /></button>
                            <button className="icon-btn" title="Excluir" onClick={() => deleteExam(ex.id)}><TrashIcon /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.section>
            </motion.div>
          )}

          {/* ── TAREFAS ── */}
          {tab === 'tarefas' && (
            <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
              <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
                <div className="section-head">
                  <h3 className="section-title">Tarefas e entregas ({data.totals.pendingTaskCount})</h3>
                  <motion.button className="btn-primary btn-sm" onClick={() => setTaskModal({})} whileTap={{ scale: 0.95 }} transition={springTap}>
                    + Tarefa
                  </motion.button>
                </div>
                {data.pendingTasks.length === 0 ? (
                  <p className="empty">Tudo em dia! 🎉</p>
                ) : (
                  <ul className="task-list">
                    <AnimatePresence initial={false}>
                      {data.pendingTasks.map((t) => {
                        const subj = subjectById(t.subjectId);
                        const overdue = t.dueDate ? daysUntil(t.dueDate) < 0 : false;
                        return (
                          <motion.li
                            key={t.id}
                            className="task-row"
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={springSmooth}
                            style={{ overflow: 'hidden' }}
                          >
                            <button className="check-box" onClick={() => toggleTask(t.id, true)} title="Concluir" />
                            <div className="task-main">
                              <span className="task-title">{t.title}</span>
                              <span className="task-meta">
                                {subj && <span className="dot" style={{ background: subj.color }} />}
                                {subj?.name}
                                {t.dueDate && (
                                  <span style={{ color: overdue ? 'var(--over)' : 'inherit' }}>
                                    {subj ? ' · ' : ''}
                                    {overdue ? 'Atrasada' : countdownLabel(t.dueDate)} ({formatDayMonth(t.dueDate)})
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="exp-actions">
                              <button className="icon-btn" title="Editar" onClick={() => setTaskModal({ task: t })}><EditIcon /></button>
                              <button className="icon-btn" title="Excluir" onClick={() => deleteTask(t.id)}><TrashIcon /></button>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              </motion.section>
            </motion.div>
          )}

          {/* ── MATÉRIAS ── */}
          {tab === 'materias' && (
            <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
              <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
                <div className="section-head">
                  <h3 className="section-title">Matérias</h3>
                  <span className="hint">{data.totals.overallProgress}% concluído</span>
                </div>

                {subjects.length === 0 && !addingSubject ? (
                  <p className="empty">Adicione suas matérias.</p>
                ) : (
                  <div className="subject-grid">
                    {subjects.map((s) => (
                      <div key={s.id} className="subject-card">
                        <button className="subject-head" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                          <span className="subject-color" style={{ background: s.color }} />
                          <div className="subject-info">
                            <span className="subject-name">{s.name}</span>
                            <span className="subject-progress-text">{s.doneCount}/{s.topicCount} assuntos · {s.progress}%</span>
                          </div>
                          <span className={`subject-chevron${expanded === s.id ? ' open' : ''}`}><ChevronDownIcon /></span>
                        </button>
                        <div className="subject-bar">
                          <div className="subject-bar-fill" style={{ width: `${s.progress}%`, background: s.color }} />
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded === s.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={springSmooth}
                              style={{ overflow: 'hidden' }}
                            >
                              <ul className="topic-list">
                                {s.topics.map((t) => (
                                  <li key={t.id} className="topic-row">
                                    <button className={`check-box${t.done ? ' checked' : ''}`} onClick={() => toggleTopic(t.id, !t.done)} title={t.done ? 'Desmarcar' : 'Concluir'}>
                                      {t.done && <CheckIcon />}
                                    </button>
                                    <span className={`topic-name${t.done ? ' done' : ''}`}>{t.name}</span>
                                    <button className="icon-btn" title="Remover" onClick={() => deleteTopic(t.id)}><TrashIcon /></button>
                                  </li>
                                ))}
                              </ul>
                              <form className="topic-add" onSubmit={(e) => { e.preventDefault(); void addTopic(s.id); }}>
                                <input
                                  type="text"
                                  value={topicInputs[s.id] ?? ''}
                                  onChange={(e) => setTopicInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                                  placeholder="Novo assunto…"
                                />
                                <button type="submit" className="btn-primary btn-sm"><PlusIcon /></button>
                              </form>
                              <div className="subject-footer">
                                <button className="btn-ghost btn-sm" onClick={() => deleteSubject(s.id)}>Excluir matéria</button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}

                {addingSubject ? (
                  <form className="topic-add" style={{ marginTop: 12 }} onSubmit={addSubject}>
                    <input type="text" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Nome da matéria" autoFocus />
                    <button type="submit" className="btn-primary btn-sm">Adicionar</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setAddingSubject(false)}>Cancelar</button>
                  </form>
                ) : (
                  <motion.button className="btn-ghost btn-sm" style={{ marginTop: 12, alignSelf: 'flex-start' }} onClick={() => setAddingSubject(true)} whileTap={{ scale: 0.95 }} transition={springTap}>
                    <PlusIcon /> Matéria
                  </motion.button>
                )}
              </motion.section>
            </motion.div>
          )}
        </>
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
