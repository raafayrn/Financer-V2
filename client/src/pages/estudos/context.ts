import { useOutletContext } from 'react-router-dom';
import type { AgendaEvent, Exam, StudiesOverview, StudyTask, Subject } from '../../api/types';

export interface EstudosCtx {
  data: StudiesOverview;
  subjects: Subject[];
  events: AgendaEvent[];
  subjectById: (id: string | null) => Subject | undefined;
  reload: () => Promise<void>;
  openExam: (exam?: Exam) => void;
  openTask: (task?: StudyTask) => void;
  openEvent: (event?: AgendaEvent, defaultDate?: string) => void;
}

export function useEstudos(): EstudosCtx {
  return useOutletContext<EstudosCtx>();
}
