import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Exam, StudiesOverview, StudyTask, Subject } from '../api/types';
import { formatDayMonth } from '../utils/format';
import { CheckIcon, ChevronDownIcon, EditIcon, PlusIcon, TrashIcon } from '../components/icons';
import { ExamModal, StudyTaskModal } from '../components/StudyModals';
import { springSmooth, springTap } from '../lib/motion';

const overviewContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const overviewItem = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSmooth },
};

const SUBJECT_COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#ff3b30'];

/** Dias até uma data ISO (positivo = futuro). */
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

export function EstudosPage() {
  const [data, setData] = useState<StudiesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});
  const [examModal, setExamModal] = useState<{ exam?: Exam } | null>(null);
  const [taskModal, setTaskModal] = useState<{ task?: StudyTask } | null>(null);

  const loadRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadRef.current;
    setError(null);
    try {
      const d = await api.getStudiesOverview();
      if (id !== loadRef.current) return;
      setData(d);
    } catch (err) {
      if (id !== loadRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      if (id === loadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="page">
      <h2 className="page-title">Estudos</h2>

      {loading && !data ? (
        <div className="center-pad">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : data ? (
        <motion.div className="overview-grid" variants={overviewContainer} initial="hidden" animate="show">
          {/* Próximas provas */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <div className="section-head">
              <h3 className="section-title">Próximas provas</h3>
              <motion.button className="btn-primary btn-sm" onClick={() => setExamModal({})} whileTap={{ scale: 0.95 }} transition={springTap}>
                + Prova
              </motion.button>
            </div>
            {data.upcomingExams.length === 0 ? (
              <p className="empty">Nenhuma prova marcada. Adicione as datas para não perder o prazo.</p>
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
                        <button className="icon-btn" title="Editar" onClick={() => setExamModal({ exam: ex })}>
                          <EditIcon />
                        </button>
                        <button className="icon-btn" title="Excluir" onClick={() => deleteExam(ex.id)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>

          {/* Tarefas pendentes */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <div className="section-head">
              <h3 className="section-title">Tarefas e entregas ({data.totals.pendingTaskCount})</h3>
              <motion.button className="btn-primary btn-sm" onClick={() => setTaskModal({})} whileTap={{ scale: 0.95 }} transition={springTap}>
                + Tarefa
              </motion.button>
            </div>
            {data.pendingTasks.length === 0 ? (
              <p className="empty">Tudo em dia! Nenhuma tarefa pendente. 🎉</p>
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
                          <button className="icon-btn" title="Editar" onClick={() => setTaskModal({ task: t })}>
                            <EditIcon />
                          </button>
                          <button className="icon-btn" title="Excluir" onClick={() => deleteTask(t.id)}>
                            <TrashIcon />
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </motion.section>

          {/* Matérias */}
          <motion.section className="card overview-item overview-span-2" variants={overviewItem}>
            <div className="section-head">
              <h3 className="section-title">Matérias</h3>
              <span className="hint">{data.totals.overallProgress}% concluído no geral</span>
            </div>

            {subjects.length === 0 && !addingSubject ? (
              <p className="empty">Adicione suas matérias e liste os assuntos para acompanhar o progresso.</p>
            ) : (
              <div className="subject-grid">
                {subjects.map((s) => (
                  <div key={s.id} className="subject-card">
                    <button className="subject-head" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                      <span className="subject-color" style={{ background: s.color }} />
                      <div className="subject-info">
                        <span className="subject-name">{s.name}</span>
                        <span className="subject-progress-text">
                          {s.doneCount}/{s.topicCount} assuntos · {s.progress}%
                        </span>
                      </div>
                      <span className={`subject-chevron${expanded === s.id ? ' open' : ''}`}>
                        <ChevronDownIcon />
                      </span>
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
                                <button
                                  className={`check-box${t.done ? ' checked' : ''}`}
                                  onClick={() => toggleTopic(t.id, !t.done)}
                                  title={t.done ? 'Desmarcar' : 'Concluir'}
                                >
                                  {t.done && <CheckIcon />}
                                </button>
                                <span className={`topic-name${t.done ? ' done' : ''}`}>{t.name}</span>
                                <button className="icon-btn" title="Remover" onClick={() => deleteTopic(t.id)}>
                                  <TrashIcon />
                                </button>
                              </li>
                            ))}
                          </ul>
                          <form
                            className="topic-add"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addTopic(s.id);
                            }}
                          >
                            <input
                              type="text"
                              value={topicInputs[s.id] ?? ''}
                              onChange={(e) => setTopicInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                              placeholder="Novo assunto…"
                            />
                            <button type="submit" className="btn-primary btn-sm">
                              <PlusIcon />
                            </button>
                          </form>
                          <div className="subject-footer">
                            <button className="btn-ghost btn-sm" onClick={() => deleteSubject(s.id)}>
                              Excluir matéria
                            </button>
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
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Nome da matéria (ex.: Cálculo I)"
                  autoFocus
                />
                <button type="submit" className="btn-primary btn-sm">
                  Adicionar
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setAddingSubject(false)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <motion.button
                className="btn-ghost btn-sm"
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
                onClick={() => setAddingSubject(true)}
                whileTap={{ scale: 0.95 }}
                transition={springTap}
              >
                <PlusIcon /> Matéria
              </motion.button>
            )}
          </motion.section>
        </motion.div>
      ) : null}

      {examModal && (
        <ExamModal subjects={subjects} initial={examModal.exam} onCancel={() => setExamModal(null)} onSubmit={saveExam} />
      )}
      {taskModal && (
        <StudyTaskModal subjects={subjects} initial={taskModal.task} onCancel={() => setTaskModal(null)} onSubmit={saveTask} />
      )}
    </div>
  );
}
