import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError } from '../lib/http';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/** Nada de listar dois anos de digest: o sino é sobre o que é recente. */
const LIMITE = 30;

const TITULO: Record<string, string> = {
  'daily-digest': 'Resumo do dia',
  'water-reminder': 'Lembrete de água',
  'month-close': 'Fechamento do mês',
};

function serializar(n: {
  id: string;
  jobKey: string;
  sentDate: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    title: TITULO[n.jobKey] ?? n.jobKey,
    body: n.body,
    date: n.sentDate,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * GET /api/notifications
 *
 * O NotificationLog nasceu como controle de "já mandei isso hoje", para o bot
 * do Telegram não repetir a mesma mensagem. Guardar o texto junto (campo
 * `body`, adicionado na migração notification_body_read) transformou o mesmo
 * registro num histórico: quem não usa o bot, ou não viu a mensagem no
 * celular, encontra a mesma coisa no sino.
 *
 * Registros antigos não têm `body` — foram gravados antes do campo existir.
 * Eles continuam aparecendo, com o título do tipo e sem corpo, em vez de
 * sumirem do histórico.
 */
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      prisma.notificationLog.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: 'desc' },
        take: LIMITE,
      }),
      prisma.notificationLog.count({ where: { userId: req.userId!, readAt: null } }),
    ]);

    res.json({ unread, notifications: items.map(serializar) });
  }),
);

/** Marca uma como lida. Idempotente: marcar de novo não muda a data original. */
notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const item = await prisma.notificationLog.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!item) throw new HttpError(404, 'Notificação não encontrada.');

    const atualizado = item.readAt
      ? item
      : await prisma.notificationLog.update({
          where: { id: item.id },
          data: { readAt: new Date() },
        });

    res.json(serializar(atualizado));
  }),
);

/** Marca todas como lidas — o gesto de "vi tudo" que o contador pede. */
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notificationLog.updateMany({
      where: { userId: req.userId!, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ marked: count });
  }),
);
