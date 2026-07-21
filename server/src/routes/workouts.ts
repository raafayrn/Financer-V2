import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { parseApiDate, dateToIso, todayIso } from '../lib/dates';
import {
  serializeWorkoutDay,
  serializeWorkoutSession,
  serializeBodyMetric,
} from '../lib/serialize';
import {
  workoutDayUpsertSchema,
  workoutExerciseCreateSchema,
  workoutExerciseUpdateSchema,
  workoutSessionCreateSchema,
  workoutSessionUpdateSchema,
  bodyMetricUpsertSchema,
} from '../validation/schemas';

export const workoutsRouter = Router();

workoutsRouter.use(requireAuth);

/** Valida o parâmetro weekday da URL (0 = Domingo ... 6 = Sábado). */
function parseWeekday(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    throw new HttpError(400, 'Dia da semana inválido (use 0 a 6).');
  }
  return n;
}

/** Segunda-feira (00:00 UTC) da semana que contém `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Dom
  const diff = (day + 6) % 7; // dias desde segunda
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

// ============================================================
// Template semanal (calendário)
// ============================================================

// Retorna os 7 dias da semana já com os dias definidos e seus exercícios.
workoutsRouter.get(
  '/plan',
  asyncHandler(async (req, res) => {
    const days = await prisma.workoutDay.findMany({
      where: { userId: req.userId! },
      include: { exercises: { orderBy: { order: 'asc' } } },
      orderBy: { weekday: 'asc' },
    });
    res.json(days.map(serializeWorkoutDay));
  }),
);

// Cria/atualiza o treino de um dia da semana.
workoutsRouter.put(
  '/plan/:weekday',
  asyncHandler(async (req, res) => {
    const weekday = parseWeekday(req.params.weekday);
    const data = parseBody(workoutDayUpsertSchema, req.body);
    const day = await prisma.workoutDay.upsert({
      where: { userId_weekday: { userId: req.userId!, weekday } },
      create: {
        userId: req.userId!,
        weekday,
        name: data.name,
        kind: data.kind ?? 'STRENGTH',
      },
      update: { name: data.name, kind: data.kind },
      include: { exercises: { orderBy: { order: 'asc' } } },
    });
    res.json(serializeWorkoutDay(day));
  }),
);

// Remove o treino de um dia (limpa o dia da rotina).
workoutsRouter.delete(
  '/plan/:weekday',
  asyncHandler(async (req, res) => {
    const weekday = parseWeekday(req.params.weekday);
    const day = await prisma.workoutDay.findUnique({
      where: { userId_weekday: { userId: req.userId!, weekday } },
    });
    if (!day) throw new HttpError(404, 'Dia não configurado.');
    await prisma.workoutDay.delete({ where: { id: day.id } });
    res.status(204).end();
  }),
);

// Adiciona um exercício ao template de um dia.
workoutsRouter.post(
  '/plan/:weekday/exercises',
  asyncHandler(async (req, res) => {
    const weekday = parseWeekday(req.params.weekday);
    const data = parseBody(workoutExerciseCreateSchema, req.body);
    const day = await prisma.workoutDay.findUnique({
      where: { userId_weekday: { userId: req.userId!, weekday } },
    });
    if (!day) throw new HttpError(404, 'Configure o treino do dia primeiro.');

    const count = await prisma.workoutExercise.count({ where: { dayId: day.id } });
    const exercise = await prisma.workoutExercise.create({
      data: {
        userId: req.userId!,
        dayId: day.id,
        name: data.name,
        muscleGroup: data.muscleGroup ?? null,
        targetSets: data.targetSets ?? null,
        targetReps: data.targetReps ?? null,
        order: data.order ?? count,
      },
    });
    res.status(201).json(exercise);
  }),
);

workoutsRouter.put(
  '/exercises/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(workoutExerciseUpdateSchema, req.body);
    const existing = await prisma.workoutExercise.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Exercício não encontrado.');
    const updated = await prisma.workoutExercise.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        muscleGroup: data.muscleGroup,
        targetSets: data.targetSets,
        targetReps: data.targetReps,
        order: data.order,
      },
    });
    res.json(updated);
  }),
);

workoutsRouter.delete(
  '/exercises/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.workoutExercise.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Exercício não encontrado.');
    await prisma.workoutExercise.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// ============================================================
// Treino de hoje
// ============================================================

workoutsRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const today = parseApiDate(todayIso());
    const weekday = today.getUTCDay();

    const [day, session] = await Promise.all([
      prisma.workoutDay.findUnique({
        where: { userId_weekday: { userId, weekday } },
        include: { exercises: { orderBy: { order: 'asc' } } },
      }),
      prisma.workoutSession.findFirst({
        where: { userId, date: today },
        include: { sets: { orderBy: { setIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      date: todayIso(),
      weekday,
      day: day ? serializeWorkoutDay(day) : null,
      session: session ? serializeWorkoutSession(session) : null,
    });
  }),
);

// ============================================================
// Sessões registradas
// ============================================================

workoutsRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const where: { userId: string; date?: { gte?: Date; lte?: Date } } = { userId };
    if (typeof req.query.from === 'string' || typeof req.query.to === 'string') {
      where.date = {};
      if (typeof req.query.from === 'string') where.date.gte = parseApiDate(req.query.from);
      if (typeof req.query.to === 'string') where.date.lte = parseApiDate(req.query.to);
    }
    const sessions = await prisma.workoutSession.findMany({
      where,
      include: { sets: { orderBy: { setIndex: 'asc' } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    res.json(sessions.map(serializeWorkoutSession));
  }),
);

workoutsRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const data = parseBody(workoutSessionCreateSchema, req.body);
    const session = await prisma.workoutSession.create({
      data: {
        userId: req.userId!,
        date: parseApiDate(data.date),
        dayId: data.dayId ?? null,
        title: data.title,
        kind: data.kind ?? 'STRENGTH',
        notes: data.notes ?? null,
        durationMin: data.durationMin ?? null,
        distanceKm: data.distanceKm ?? null,
        sets: data.sets
          ? {
              create: data.sets.map((s, i) => ({
                userId: req.userId!,
                exerciseName: s.exerciseName,
                muscleGroup: s.muscleGroup ?? null,
                setIndex: s.setIndex ?? i + 1,
                weightKg: s.weightKg ?? null,
                reps: s.reps ?? null,
              })),
            }
          : undefined,
      },
      include: { sets: { orderBy: { setIndex: 'asc' } } },
    });
    res.status(201).json(serializeWorkoutSession(session));
  }),
);

workoutsRouter.put(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(workoutSessionUpdateSchema, req.body);
    const existing = await prisma.workoutSession.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Sessão não encontrada.');

    // Quando `sets` vem no corpo, substitui todas as séries da sessão.
    const updated = await prisma.$transaction(async (tx) => {
      if (data.sets) {
        await tx.workoutSetLog.deleteMany({ where: { sessionId: existing.id } });
        await tx.workoutSetLog.createMany({
          data: data.sets.map((s, i) => ({
            userId: req.userId!,
            sessionId: existing.id,
            exerciseName: s.exerciseName,
            muscleGroup: s.muscleGroup ?? null,
            setIndex: s.setIndex ?? i + 1,
            weightKg: s.weightKg ?? null,
            reps: s.reps ?? null,
          })),
        });
      }
      return tx.workoutSession.update({
        where: { id: existing.id },
        data: {
          date: data.date !== undefined ? parseApiDate(data.date) : undefined,
          dayId: data.dayId,
          title: data.title,
          kind: data.kind,
          notes: data.notes,
          durationMin: data.durationMin,
          distanceKm: data.distanceKm,
        },
        include: { sets: { orderBy: { setIndex: 'asc' } } },
      });
    });
    res.json(serializeWorkoutSession(updated));
  }),
);

workoutsRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.workoutSession.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Sessão não encontrada.');
    await prisma.workoutSession.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// ============================================================
// Resumo (frequência, streak, volume, evolução de carga)
// ============================================================

workoutsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const now = parseApiDate(todayIso());
    const weekStart = startOfWeek(now);
    // Considera as últimas 8 semanas para o gráfico de frequência.
    const rangeStart = new Date(weekStart);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7 * 7);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, date: { gte: rangeStart } },
      include: { sets: true },
      orderBy: { date: 'asc' },
    });

    // Frequência por semana (8 semanas até a atual).
    const weeks: { weekStart: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = new Date(weekStart);
      ws.setUTCDate(ws.getUTCDate() - 7 * i);
      const we = new Date(ws);
      we.setUTCDate(we.getUTCDate() + 7);
      const count = sessions.filter((s) => s.date >= ws && s.date < we).length;
      weeks.push({ weekStart: dateToIso(ws), count });
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const thisWeek = sessions.filter((s) => s.date >= weekStart && s.date < weekEnd);
    const thisWeekCount = thisWeek.length;

    // Streak de semanas consecutivas (a partir da atual, para trás) com treino.
    let weekStreak = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].count > 0) weekStreak++;
      else break;
    }

    // Volume da semana atual: nº de séries por grupo muscular.
    const volumeMap = new Map<string, number>();
    for (const s of thisWeek) {
      for (const set of s.sets) {
        const g = set.muscleGroup || 'Outros';
        volumeMap.set(g, (volumeMap.get(g) ?? 0) + 1);
      }
    }
    const volumeByMuscle = Array.from(volumeMap.entries())
      .map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets);

    // Exercícios com carga registrada: PR e último peso.
    const allSets = await prisma.workoutSetLog.findMany({
      where: { userId, weightKg: { not: null } },
      include: { session: { select: { date: true } } },
    });
    const exMap = new Map<
      string,
      { pr: number; lastWeight: number; lastDate: Date; count: number }
    >();
    for (const set of allSets) {
      const w = set.weightKg ?? 0;
      const d = set.session.date;
      const cur = exMap.get(set.exerciseName);
      if (!cur) {
        exMap.set(set.exerciseName, { pr: w, lastWeight: w, lastDate: d, count: 1 });
      } else {
        cur.pr = Math.max(cur.pr, w);
        cur.count += 1;
        if (d >= cur.lastDate) {
          cur.lastDate = d;
          cur.lastWeight = w;
        }
      }
    }
    const exercises = Array.from(exMap.entries())
      .map(([name, v]) => ({
        name,
        pr: v.pr,
        lastWeight: v.lastWeight,
        lastDate: dateToIso(v.lastDate),
        setCount: v.count,
      }))
      .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));

    res.json({
      thisWeekCount,
      weekStreak,
      totalSessions: await prisma.workoutSession.count({ where: { userId } }),
      weeks,
      volumeByMuscle,
      exercises,
    });
  }),
);

// Evolução de carga de um exercício: melhor carga por data.
workoutsRouter.get(
  '/exercises/:name/history',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const name = req.params.name;
    const sets = await prisma.workoutSetLog.findMany({
      where: { userId, exerciseName: name, weightKg: { not: null } },
      include: { session: { select: { date: true } } },
    });
    const byDate = new Map<string, { maxWeight: number; topReps: number }>();
    for (const s of sets) {
      const d = dateToIso(s.session.date);
      const w = s.weightKg ?? 0;
      const cur = byDate.get(d);
      if (!cur) byDate.set(d, { maxWeight: w, topReps: s.reps ?? 0 });
      else if (w > cur.maxWeight) byDate.set(d, { maxWeight: w, topReps: s.reps ?? 0 });
    }
    const points = Array.from(byDate.entries())
      .map(([date, v]) => ({ date, maxWeight: v.maxWeight, topReps: v.topReps }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    res.json({ name, points });
  }),
);

// ============================================================
// Peso corporal e medidas
// ============================================================

workoutsRouter.get(
  '/body',
  asyncHandler(async (req, res) => {
    const metrics = await prisma.bodyMetric.findMany({
      where: { userId: req.userId! },
      orderBy: { date: 'desc' },
      take: 365,
    });
    res.json(metrics.map(serializeBodyMetric));
  }),
);

// Upsert por data (um registro por dia).
workoutsRouter.put(
  '/body',
  asyncHandler(async (req, res) => {
    const data = parseBody(bodyMetricUpsertSchema, req.body);
    const date = parseApiDate(data.date);
    const fields = {
      weightKg: data.weightKg ?? null,
      bodyFat: data.bodyFat ?? null,
      waistCm: data.waistCm ?? null,
      chestCm: data.chestCm ?? null,
      armCm: data.armCm ?? null,
      hipCm: data.hipCm ?? null,
      thighCm: data.thighCm ?? null,
      notes: data.notes ?? null,
    };
    const metric = await prisma.bodyMetric.upsert({
      where: { userId_date: { userId: req.userId!, date } },
      create: { userId: req.userId!, date, ...fields },
      update: fields,
    });
    res.json(serializeBodyMetric(metric));
  }),
);

workoutsRouter.delete(
  '/body/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.bodyMetric.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Registro não encontrado.');
    await prisma.bodyMetric.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
