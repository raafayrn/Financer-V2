import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { env } from '../env';
import { createPairingCode } from '../lib/telegramPairing';

export const telegramRouter = Router();

telegramRouter.use(requireAuth);

/** Estado da integração: se o bot está configurado no servidor e se esta conta já está vinculada. */
telegramRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { telegramChatId: true },
    });
    res.json({
      enabled: env.telegramEnabled,
      botUsername: env.telegramBotUsername || null,
      linked: Boolean(user?.telegramChatId),
    });
  }),
);

/** Gera um código de pareamento de 6 dígitos, válido por 10 minutos. */
telegramRouter.post(
  '/pair',
  asyncHandler(async (req, res) => {
    const code = createPairingCode(req.userId!);
    res.json({ code, botUsername: env.telegramBotUsername || null });
  }),
);

/** Desvincula a conta do Telegram (o usuário pode gerar um novo código depois). */
telegramRouter.post(
  '/unlink',
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.userId! }, data: { telegramChatId: null } });
    res.status(204).end();
  }),
);
