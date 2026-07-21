import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { parseApiDate, dateToIso, todayIso } from '../lib/dates';
import {
  serializeSubject,
  serializeTopic,
  serializeExam,
  serializeStudyTask,
} from '../lib/serialize';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  topicCreateSchema,
  topicUpdateSchema,
  examCreateSchema,
  examUpdateSchema,
  studyTaskCreateSchema,
  studyTaskUpdateSchema,
} from '../validation/schemas';

export const studiesRouter = Router();

studiesRouter.use(requireAuth);

// ============================================================
// Visão geral (tela inicial: próximas provas + hoje + matérias)
// ============================================================

studiesRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const today = parseApiDate(todayIso());

    const [subjects, upcomingExams, tasks] = await Promise.all([
      prisma.subject.findMany({
        where: { userId },
        include: { topics: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.exam.findMany({
        where: { userId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 10,
      }),
      prisma.studyTask.findMany({
        where: { userId, done: false },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const totalTopics = subjects.reduce((s, sub) => s + sub.topics.length, 0);
    const doneTopics = subjects.reduce(
      (s, sub) => s + sub.topics.filter((t) => t.done).length,
      0,
    );

    res.json({
      subjects: subjects.map(serializeSubject),
      upcomingExams: upcomingExams.map(serializeExam),
      pendingTasks: tasks.map(serializeStudyTask),
      totals: {
        subjectCount: subjects.length,
        totalTopics,
        doneTopics,
        overallProgress: totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0,
        pendingTaskCount: tasks.length,
      },
    });
  }),
);

// ============================================================
// Matérias
// ============================================================

studiesRouter.get(
  '/subjects',
  asyncHandler(async (req, res) => {
    const subjects = await prisma.subject.findMany({
      where: { userId: req.userId! },
      include: { topics: { orderBy: { order: 'asc' } } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(subjects.map(serializeSubject));
  }),
);

studiesRouter.post(
  '/subjects',
  asyncHandler(async (req, res) => {
    const data = parseBody(subjectCreateSchema, req.body);
    const count = await prisma.subject.count({ where: { userId: req.userId! } });
    const subject = await prisma.subject.create({
      data: {
        userId: req.userId!,
        name: data.name,
        color: data.color ?? '#007aff',
        order: data.order ?? count,
      },
      include: { topics: true },
    });
    res.status(201).json(serializeSubject(subject));
  }),
);

studiesRouter.put(
  '/subjects/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(subjectUpdateSchema, req.body);
    const existing = await prisma.subject.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Matéria não encontrada.');
    const updated = await prisma.subject.update({
      where: { id: existing.id },
      data: { name: data.name, color: data.color, order: data.order },
      include: { topics: { orderBy: { order: 'asc' } } },
    });
    res.json(serializeSubject(updated));
  }),
);

studiesRouter.delete(
  '/subjects/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.subject.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Matéria não encontrada.');
    await prisma.subject.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// ============================================================
// Assuntos (tópicos)
// ============================================================

studiesRouter.post(
  '/subjects/:subjectId/topics',
  asyncHandler(async (req, res) => {
    const data = parseBody(topicCreateSchema, req.body);
    const subject = await prisma.subject.findFirst({
      where: { id: req.params.subjectId, userId: req.userId! },
    });
    if (!subject) throw new HttpError(404, 'Matéria não encontrada.');
    const count = await prisma.topic.count({ where: { subjectId: subject.id } });
    const topic = await prisma.topic.create({
      data: {
        userId: req.userId!,
        subjectId: subject.id,
        name: data.name,
        done: data.done ?? false,
        order: data.order ?? count,
      },
    });
    res.status(201).json(serializeTopic(topic));
  }),
);

studiesRouter.put(
  '/topics/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(topicUpdateSchema, req.body);
    const existing = await prisma.topic.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Assunto não encontrado.');
    const updated = await prisma.topic.update({
      where: { id: existing.id },
      data: { name: data.name, done: data.done, order: data.order },
    });
    res.json(serializeTopic(updated));
  }),
);

studiesRouter.delete(
  '/topics/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.topic.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Assunto não encontrado.');
    await prisma.topic.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// ============================================================
// Provas
// ============================================================

studiesRouter.get(
  '/exams',
  asyncHandler(async (req, res) => {
    const exams = await prisma.exam.findMany({
      where: { userId: req.userId! },
      orderBy: { date: 'asc' },
    });
    res.json(exams.map(serializeExam));
  }),
);

studiesRouter.post(
  '/exams',
  asyncHandler(async (req, res) => {
    const data = parseBody(examCreateSchema, req.body);
    const exam = await prisma.exam.create({
      data: {
        userId: req.userId!,
        title: data.title,
        date: parseApiDate(data.date),
        subjectId: data.subjectId ?? null,
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(serializeExam(exam));
  }),
);

studiesRouter.put(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(examUpdateSchema, req.body);
    const existing = await prisma.exam.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Prova não encontrada.');
    const updated = await prisma.exam.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        date: data.date !== undefined ? parseApiDate(data.date) : undefined,
        subjectId: data.subjectId,
        notes: data.notes,
      },
    });
    res.json(serializeExam(updated));
  }),
);

studiesRouter.delete(
  '/exams/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.exam.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Prova não encontrada.');
    await prisma.exam.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// ============================================================
// Tarefas / entregas
// ============================================================

studiesRouter.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const tasks = await prisma.studyTask.findMany({
      where: { userId: req.userId! },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(tasks.map(serializeStudyTask));
  }),
);

studiesRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const data = parseBody(studyTaskCreateSchema, req.body);
    const task = await prisma.studyTask.create({
      data: {
        userId: req.userId!,
        title: data.title,
        dueDate: data.dueDate ? parseApiDate(data.dueDate) : null,
        subjectId: data.subjectId ?? null,
        done: data.done ?? false,
      },
    });
    res.status(201).json(serializeStudyTask(task));
  }),
);

studiesRouter.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(studyTaskUpdateSchema, req.body);
    const existing = await prisma.studyTask.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Tarefa não encontrada.');
    const updated = await prisma.studyTask.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        dueDate:
          data.dueDate === undefined ? undefined : data.dueDate ? parseApiDate(data.dueDate) : null,
        subjectId: data.subjectId,
        done: data.done,
      },
    });
    res.json(serializeStudyTask(updated));
  }),
);

studiesRouter.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.studyTask.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Tarefa não encontrada.');
    await prisma.studyTask.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
