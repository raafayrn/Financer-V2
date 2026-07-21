import { centsToReais } from './money';
import { dateToIso } from './dates';

// Tipos mínimos vindos do Prisma que precisamos serializar.
interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  date: Date;
  categoryId: string | null;
  accountId: string | null;
  recurring: boolean;
  createdAt: Date;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
}

/** Converte uma despesa do banco (centavos) para o formato da API (reais). */
export function serializeExpense(e: ExpenseRow) {
  return {
    id: e.id,
    description: e.description,
    amount: centsToReais(e.amount),
    date: e.date.toISOString().slice(0, 10), // AAAA-MM-DD
    categoryId: e.categoryId,
    accountId: e.accountId,
    recurring: e.recurring,
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeCategory(c: CategoryRow) {
  return { id: c.id, name: c.name, color: c.color };
}

interface InvestmentRow {
  id: string;
  description: string;
  type: string;
  kind: string;
  amount: number;
  date: Date;
  notes: string | null;
  createdAt: Date;
}

export function serializeInvestment(i: InvestmentRow) {
  return {
    id: i.id,
    description: i.description,
    type: i.type,
    kind: i.kind,
    amount: centsToReais(i.amount),
    date: i.date.toISOString().slice(0, 10),
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  };
}

// ============================================================
// Saúde — Treinos
// ============================================================

interface WorkoutExerciseRow {
  id: string;
  dayId: string;
  name: string;
  muscleGroup: string | null;
  targetSets: number | null;
  targetReps: string | null;
  order: number;
}

export function serializeWorkoutExercise(e: WorkoutExerciseRow) {
  return {
    id: e.id,
    dayId: e.dayId,
    name: e.name,
    muscleGroup: e.muscleGroup,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
    order: e.order,
  };
}

interface WorkoutDayRow {
  id: string;
  weekday: number;
  name: string;
  kind: string;
  exercises?: WorkoutExerciseRow[];
}

export function serializeWorkoutDay(d: WorkoutDayRow) {
  return {
    id: d.id,
    weekday: d.weekday,
    name: d.name,
    kind: d.kind,
    exercises: (d.exercises ?? []).map(serializeWorkoutExercise),
  };
}

interface WorkoutSetRow {
  id: string;
  sessionId: string;
  exerciseName: string;
  muscleGroup: string | null;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
}

export function serializeWorkoutSet(s: WorkoutSetRow) {
  return {
    id: s.id,
    sessionId: s.sessionId,
    exerciseName: s.exerciseName,
    muscleGroup: s.muscleGroup,
    setIndex: s.setIndex,
    weightKg: s.weightKg,
    reps: s.reps,
  };
}

interface WorkoutSessionRow {
  id: string;
  date: Date;
  dayId: string | null;
  title: string;
  kind: string;
  notes: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  createdAt: Date;
  sets?: WorkoutSetRow[];
}

export function serializeWorkoutSession(s: WorkoutSessionRow) {
  return {
    id: s.id,
    date: dateToIso(s.date),
    dayId: s.dayId,
    title: s.title,
    kind: s.kind,
    notes: s.notes,
    durationMin: s.durationMin,
    distanceKm: s.distanceKm,
    sets: (s.sets ?? []).map(serializeWorkoutSet),
    createdAt: s.createdAt.toISOString(),
  };
}

interface BodyMetricRow {
  id: string;
  date: Date;
  weightKg: number | null;
  bodyFat: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  thighCm: number | null;
  notes: string | null;
}

export function serializeBodyMetric(m: BodyMetricRow) {
  return {
    id: m.id,
    date: dateToIso(m.date),
    weightKg: m.weightKg,
    bodyFat: m.bodyFat,
    waistCm: m.waistCm,
    chestCm: m.chestCm,
    armCm: m.armCm,
    hipCm: m.hipCm,
    thighCm: m.thighCm,
    notes: m.notes,
  };
}

// ============================================================
// Saúde — Água
// ============================================================

interface WaterEntryRow {
  id: string;
  date: Date;
  amountMl: number;
  createdAt: Date;
}

export function serializeWaterEntry(e: WaterEntryRow) {
  return {
    id: e.id,
    date: dateToIso(e.date),
    amountMl: e.amountMl,
    createdAt: e.createdAt.toISOString(),
  };
}

// ============================================================
// Estudos
// ============================================================

interface TopicRow {
  id: string;
  subjectId: string;
  name: string;
  done: boolean;
  order: number;
}

export function serializeTopic(t: TopicRow) {
  return {
    id: t.id,
    subjectId: t.subjectId,
    name: t.name,
    done: t.done,
    order: t.order,
  };
}

interface SubjectRow {
  id: string;
  name: string;
  color: string;
  order: number;
  topics?: TopicRow[];
}

export function serializeSubject(s: SubjectRow) {
  const topics = s.topics ?? [];
  const total = topics.length;
  const done = topics.filter((t) => t.done).length;
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    order: s.order,
    topics: topics.map(serializeTopic),
    topicCount: total,
    doneCount: done,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

interface ExamRow {
  id: string;
  subjectId: string | null;
  title: string;
  date: Date;
  notes: string | null;
}

export function serializeExam(e: ExamRow) {
  return {
    id: e.id,
    subjectId: e.subjectId,
    title: e.title,
    date: dateToIso(e.date),
    notes: e.notes,
  };
}

interface StudyTaskRow {
  id: string;
  subjectId: string | null;
  title: string;
  dueDate: Date | null;
  done: boolean;
}

export function serializeStudyTask(t: StudyTaskRow) {
  return {
    id: t.id,
    subjectId: t.subjectId,
    title: t.title,
    dueDate: t.dueDate ? dateToIso(t.dueDate) : null,
    done: t.done,
  };
}
