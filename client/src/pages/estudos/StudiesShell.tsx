import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type {
  AgendaEvent,
  AgendaEventCategory,
  Exam,
  StudiesOverview,
  StudyTask,
} from '../../api/types';
import { AgendaEventModal, ExamModal, StudyTaskModal } from '../../components/StudyModals';
import type { EstudosCtx } from './context';

type ExamModalState = { exam?: Exam } | null;
type TaskModalState = { task?: StudyTask } | null;
type EventModalState = { event?: AgendaEvent; defaultDate?: string } | null;

/**
 * Carrega matérias, provas, tarefas e eventos, e concentra os três modais.
 * Serve tanto a seção Estudos quanto a Agenda — as duas leem os mesmos dados,
 * então dividir o carregamento evitaria manter dois estados em sincronia.
 */
export function StudiesShell() {
  const [data, setData] = useState<StudiesOverview | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examModal, setExamModal] = useState<ExamModalState>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState>(null);
  const [eventModal, setEventModal] = useState<EventModalState>(null);

  const loadRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadRef.current;
    setError(null);
    try {
      const [d, evs] = await Promise.all([api.getStudiesOverview(), api.listAgendaEvents()]);
      if (id !== loadRef.current) return;
      setData(d);
      setEvents(evs);
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

  async function saveExam(d: {
    title: string;
    date: string;
    subjectId: string | null;
    term: number | null;
    notes: string | null;
  }) {
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

  async function saveEvent(d: {
    title: string;
    date: string;
    time: string | null;
    notes: string | null;
    category: AgendaEventCategory;
  }) {
    if (eventModal?.event) await api.updateAgendaEvent(eventModal.event.id, d);
    else await api.createAgendaEvent(d);
    setEventModal(null);
    await load();
  }

  if (loading && !data) {
    return (
      <div className="center-pad">
        <div className="spinner" />
      </div>
    );
  }
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const subjects = data.subjects ?? [];
  const ctx: EstudosCtx = {
    data,
    subjects,
    events,
    subjectById: (id) => subjects.find((s) => s.id === id),
    reload: load,
    openExam: (exam) => setExamModal({ exam }),
    openTask: (task) => setTaskModal({ task }),
    openEvent: (event, defaultDate) => setEventModal({ event, defaultDate }),
  };

  return (
    <>
      <Outlet context={ctx} />

      {eventModal && (
        <AgendaEventModal
          initial={eventModal.event}
          defaultDate={eventModal.defaultDate}
          onCancel={() => setEventModal(null)}
          onSubmit={saveEvent}
        />
      )}
      {examModal && (
        <ExamModal
          subjects={subjects}
          initial={examModal.exam}
          onCancel={() => setExamModal(null)}
          onSubmit={saveExam}
        />
      )}
      {taskModal && (
        <StudyTaskModal
          subjects={subjects}
          initial={taskModal.task}
          onCancel={() => setTaskModal(null)}
          onSubmit={saveTask}
        />
      )}
    </>
  );
}
