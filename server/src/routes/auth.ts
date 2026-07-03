import { Router } from 'express';
import { prisma } from '../prisma';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { loginSchema, registerSchema } from '../validation/schemas';
import { ensureAccountsForUser } from '../lib/accounts';

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = parseBody(registerSchema, req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'Já existe uma conta com este e-mail.');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });
    await ensureAccountsForUser(prisma, user.id);

    const token = signToken({ userId: user.id });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    // Backfill: contas criadas antes desse recurso existir.
    await ensureAccountsForUser(prisma, user.id);

    const token = signToken({ userId: user.id });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(404, 'Usuário não encontrado.');
    res.json({ id: user.id, name: user.name, email: user.email });
  }),
);
