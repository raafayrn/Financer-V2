import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { loginSchema, registerSchema } from '../validation/schemas';
import { ensureAccountsForUser } from '../lib/accounts';
import { env } from '../env';

export const authRouter = Router();

// Cada tentativa de login gasta um bcrypt de 12 rounds (~250ms de CPU). Sem
// limite, isso é força bruta de senha E vetor de DoS ao mesmo tempo. Conta
// por IP, já que aqui ainda não existe usuário autenticado.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Só conta as tentativas que falharam — acertar a senha não gasta cota.
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' },
});

authRouter.post(
  '/register',
  loginLimiter,
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
  loginLimiter,
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

// App de uso pessoal: NÃO existe tela de login. Esta rota devolve um token
// para o dono do app sem pedir credencial, e cria a conta na primeira
// execução — assim uma instalação nova já abre direto no app.
//
// ATENÇÃO: esta rota não exige credencial. Quem alcança a porta da API entra
// como você. Mantenha a API só em redes que você controla (loopback, VPN
// pessoal / Tailscale) e nunca a publique na internet aberta.
authRouter.post(
  '/auto',
  asyncHandler(async (_req, res) => {
    let user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!user) {
      // Primeira execução: cria o dono do app. A senha é aleatória e não é
      // usada em lugar nenhum (o acesso é por esta rota); serve só para
      // satisfazer o schema e para os scripts administrativos poderem
      // redefini-la depois, se um dia você quiser habilitar login por senha.
      user = await prisma.user.create({
        data: {
          name: env.defaultUserName,
          email: env.defaultUserEmail,
          passwordHash: await hashPassword(randomBytes(32).toString('hex')),
        },
      });
      console.log(`Conta do app criada automaticamente: ${user.email}`);
    }

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
