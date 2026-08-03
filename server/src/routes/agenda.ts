import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { parseApiDate } from '../lib/dates';
import { serializeAgendaEvent } from '../lib/serialize';
import { agendaEventCreateSchema, agendaEventUpdateSchema } from '../validation/schemas';

export const agendaRouter = Router();

agendaRouter.use(requireAuth);

agendaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const events = await prisma.agendaEvent.findMany({
      where: { userId: req.userId! },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(events.map(serializeAgendaEvent));
  }),
);

agendaRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(agendaEventCreateSchema, req.body);
    const event = await prisma.agendaEvent.create({
      data: {
        userId: req.userId!,
        title: data.title,
        date: parseApiDate(data.date),
        time: data.time ?? null,
        notes: data.notes ?? null,
        category: data.category ?? 'OUTRO',
      },
    });
    res.status(201).json(serializeAgendaEvent(event));
  }),
);

agendaRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(agendaEventUpdateSchema, req.body);
    const existing = await prisma.agendaEvent.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Evento não encontrado.');
    const updated = await prisma.agendaEvent.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        date: data.date !== undefined ? parseApiDate(data.date) : undefined,
        time: data.time,
        notes: data.notes,
        category: data.category,
      },
    });
    res.json(serializeAgendaEvent(updated));
  }),
);

agendaRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.agendaEvent.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) throw new HttpError(404, 'Evento não encontrado.');
    await prisma.agendaEvent.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
