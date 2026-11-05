import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, parseBody } from '../lib/http';
import { backgroundUpdateSchema } from '../validation/schemas';

export const backgroundRouter = Router();

backgroundRouter.use(requireAuth);

// Plano de fundo atual. Sem registro, o cliente usa a cena padrão.
backgroundRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const bg = await prisma.userBackground.findUnique({ where: { userId: req.userId! } });
    res.json({ preset: bg?.preset ?? 'aurora', image: bg?.image ?? null });
  }),
);

// Troca o fundo. Escolher uma cena embutida mantém a última foto enviada, para
// dar pra voltar a ela sem reenviar; enviar uma foto nova substitui a anterior.
backgroundRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { preset, image } = parseBody(backgroundUpdateSchema, req.body);
    const bg = await prisma.userBackground.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, preset, image: image ?? null },
      update: image ? { preset, image } : { preset },
    });
    res.json({ preset: bg.preset, image: bg.image });
  }),
);
