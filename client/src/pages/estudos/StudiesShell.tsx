import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import {
  useAgendaEvents,
  useCreateAgendaEvent,
  useCreateExam,
  useCreateStudyTask,
  useStudiesOverview,
  useUpdateAgendaEvent,
  useUpdateExam,
  useUpdateStudyTask,
} from '../../api/queries';
import type { AgendaEvent, AgendaEventCategory, Exam, StudyTask } from '../../api/types';
import { SkeletonCard } from '../../components/Skeleton';
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
  const qc = useQueryClient();

  const [examModal, setExamModal] = useState<ExamModalState>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState>(null);
  const [eventModal, setEventModal] = useState<EventModalState>(null);

  // As duas seções (Estudos e Agenda) montam este shell e compartilham as
  // mesmas keys — trocar de uma para a outra não refaz requisição nenhuma.
  const overviewQuery = useStudiesOverview();
  const eventsQuery = useAgendaEvents();

  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const createTask = useCreateStudyTask();
  const updateTask = useUpdateStudyTask();
  const createEvent = useCreateAgendaEvent();
  const updateEvent = useUpdateAgendaEvent();

  const data = overviewQuery.data;
  const events = eventsQuery.data ?? [];
  const error = overviewQuery.error ?? eventsQuery.error;

  async function saveExam(d: {
    title: string;
    date: string;
    subjectId: string | null;
    term: number | null;
    notes: string | null;
  }) {
    if (examModal?.exam) await updateExam.mutateAsync({ id: examModal.exam.id, data: d });
    else await createExam.mutateAsync(d);
    setExamModal(null);
  }

  async function saveTask(d: { title: string; dueDate: string | null; subjectId: string | null }) {
    if (taskModal?.task) await updateTask.mutateAsync({ id: taskModal.task.id, data: d });
    else await createTask.mutateAsync(d);
    setTaskModal(null);
  }

  async function saveEvent(d: {
    title: string;
    date: string;
    time: string | null;
    notes: string | null;
    category: AgendaEventCategory;
  }) {
    if (eventModal?.event) await updateEvent.mutateAsync({ id: eventModal.event.id, data: d });
    else await createEvent.mutateAsync(d);
    setEventModal(null);
  }

  if (!data && (overviewQuery.isPending || eventsQuery.isPending)) {
    return (
      <div className="ms-stack">
        <SkeletonCard rows={4} circle={false} />
        <SkeletonCard rows={3} circle={false} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="alert alert-error">
        {error instanceof ApiError ? error.message : 'Erro ao carregar.'}
      </div>
    );
  }
  if (!data) return null;

  const subjects = data.subjects ?? [];
  const ctx: EstudosCtx = {
    data,
    subjects,
    events,
    subjectById: (id) => subjects.find((s) => s.id === id),
    // As mutações de estudos/agenda já invalidam ['studies'] e ['agenda'];
    // isto atende quem ainda pede recarga explícita.
    reload: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['studies'] }),
        qc.invalidateQueries({ queryKey: ['agenda'] }),
      ]);
    },
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
