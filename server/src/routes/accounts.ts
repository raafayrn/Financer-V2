import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { ensureAccountsForUser } from '../lib/accounts';

export const accountsRouter = Router();

accountsRouter.use(requireAuth);

// Lista as 3 contas fixas do usuário (cria as que faltarem).
accountsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    await ensureAccountsForUser(prisma, userId);
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { kind: 'asc' },
    });
    res.json(accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind })));
  }),
);
