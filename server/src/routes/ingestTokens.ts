import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { generateIngestToken } from '../auth/ingestToken';
import { ingestTokenCreateSchema } from '../validation/schemas';

export const ingestTokensRouter = Router();

ingestTokensRouter.use(requireAuth);

/**
 * Tokens dos canais automáticos. Um por dispositivo/canal, para que revogar o
 * do iPhone perdido não derrube o webhook de e-mail.
 *
 * A lista nunca devolve o token — só o prefixo. O valor em claro existe uma
 * única vez, na resposta do POST; depois disso nem o servidor sabe qual era.
 */

function serializeToken(t: {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    label: t.label,
    prefix: t.prefix,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

ingestTokensRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tokens = await prisma.ingestToken.findMany({
      where: { userId: req.userId as string },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tokens: tokens.map(serializeToken) });
  }),
);

ingestTokensRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { label } = parseBody(ingestTokenCreateSchema, req.body);
    const { token, tokenHash, prefix } = generateIngestToken();

    const created = await prisma.ingestToken.create({
      data: { userId: req.userId as string, label, tokenHash, prefix },
    });

    res.status(201).json({
      ...serializeToken(created),
      // Única vez que o valor aparece. A tela precisa deixar isso claro.
      token,
    });
  }),
);

ingestTokensRouter.post(
  '/:id/revoke',
  asyncHandler(async (req, res) => {
    const existing = await prisma.ingestToken.findFirst({
      where: { id: req.params.id, userId: req.userId as string },
    });
    if (!existing) throw new HttpError(404, 'Token não encontrado.');

    // Revogar em vez de apagar: a linha continua contando quando o token foi
    // usado pela última vez, que é o que responde "esse canal ainda roda?".
    const updated = await prisma.ingestToken.update({
      where: { id: existing.id },
      data: { revokedAt: existing.revokedAt ?? new Date() },
    });
    res.json(serializeToken(updated));
  }),
);
