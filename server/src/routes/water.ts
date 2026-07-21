import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { parseApiDate, dateToIso, todayIso } from '../lib/dates';
import { serializeWaterEntry } from '../lib/serialize';
import { waterGoalSchema, waterEntryCreateSchema } from '../validation/schemas';

export const waterRouter = Router();

waterRouter.use(requireAuth);

const DEFAULT_GOAL_ML = 3000;

/** Meta diária de água do usuário (cria com padrão se ainda não existir). */
async function getGoalMl(userId: string): Promise<number> {
  const goal = await prisma.waterGoal.findUnique({ where: { userId } });
  return goal?.goalMl ?? DEFAULT_GOAL_ML;
}

// Resumo do dia: meta, consumido e as entradas de uma data (default: hoje).
waterRouter.get(
  '/day',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const dateStr = typeof req.query.date === 'string' ? req.query.date : todayIso();
    const date = parseApiDate(dateStr);

    const [goalMl, entries] = await Promise.all([
      getGoalMl(userId),
      prisma.waterEntry.findMany({
        where: { userId, date },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const consumedMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
    res.json({
      date: dateStr,
      goalMl,
      consumedMl,
      percent: goalMl > 0 ? Math.min(100, Math.round((consumedMl / goalMl) * 100)) : 0,
      entries: entries.map(serializeWaterEntry),
    });
  }),
);

// Histórico dos últimos N dias (default 14): consumo total por dia.
waterRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const end = parseApiDate(todayIso());
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const [goalMl, entries] = await Promise.all([
      getGoalMl(userId),
      prisma.waterEntry.findMany({
        where: { userId, date: { gte: start, lte: end } },
      }),
    ]);

    const byDate = new Map<string, number>();
    for (const e of entries) {
      const d = dateToIso(e.date);
      byDate.set(d, (byDate.get(d) ?? 0) + e.amountMl);
    }
    const result: { date: string; consumedMl: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = dateToIso(d);
      result.push({ date: iso, consumedMl: byDate.get(iso) ?? 0 });
    }
    res.json({ goalMl, days: result });
  }),
);

// Atualiza a meta diária.
waterRouter.put(
  '/goal',
  asyncHandler(async (req, res) => {
    const data = parseBody(waterGoalSchema, req.body);
    const goal = await prisma.waterGoal.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, goalMl: data.goalMl },
      update: { goalMl: data.goalMl },
    });
    res.json({ goalMl: goal.goalMl });
  }),
);

// Registra um consumo de água (default: hoje).
waterRouter.post(
  '/entries',
  asyncHandler(async (req, res) => {
    const data = parseBody(waterEntryCreateSchema, req.body);
    const date = parseApiDate(data.date ?? todayIso());
    const entry = await prisma.waterEntry.create({
      data: { userId: req.userId!, date, amountMl: data.amountMl },
    });
    res.status(201).json(serializeWaterEntry(entry));
  }),
);

waterRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.waterEntry.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Registro não encontrado.');
    await prisma.waterEntry.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
