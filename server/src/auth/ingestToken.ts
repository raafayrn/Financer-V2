import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma';

/**
 * Autenticação dos canais automáticos (atalho do iPhone, webhook de e-mail).
 *
 * O JWT da sessão expira em 7 dias e o Atalhos do iOS não sabe renovar nada,
 * então cada canal ganha um token próprio, de longa duração e revogável
 * sozinho. Ele vale SÓ para a rota de ingestão — não abre o resto do app.
 *
 * Guardamos apenas o hash. O token é aleatório de 32 bytes (alta entropia),
 * então SHA-256 basta: bcrypt existe para proteger segredos adivinháveis, e
 * pagaríamos o custo dele a cada requisição sem ganhar nada.
 */

const PREFIX = 'orb_';

export function hashIngestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Gera um token novo. O valor em claro só existe aqui — o banco guarda o hash. */
export function generateIngestToken(): { token: string; tokenHash: string; prefix: string } {
  const token = PREFIX + randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashIngestToken(token),
    // O suficiente para reconhecer a linha na tela sem revelar o segredo.
    prefix: token.slice(0, PREFIX.length + 6),
  };
}

/** Compara dois hashes hex em tempo constante. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Aceita `Authorization: Bearer <token de ingestão>` e preenche req.userId.
 * Não cai de volta para o JWT de sessão: quem chega por aqui é máquina, e
 * misturar as duas credenciais na mesma porta só amplia o que um token
 * vazado alcança.
 */
export function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de ingestão ausente.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const tokenHash = hashIngestToken(token);

  prisma.ingestToken
    .findUnique({ where: { tokenHash } })
    .then(async (record) => {
      // A comparação em tempo constante é redundante depois de um lookup por
      // índice, mas custa nada e evita depender do banco para isso.
      if (!record || !hashesMatch(record.tokenHash, tokenHash)) {
        res.status(401).json({ error: 'Token de ingestão inválido.' });
        return;
      }
      if (record.revokedAt) {
        res.status(401).json({ error: 'Token de ingestão revogado.' });
        return;
      }
      req.userId = record.userId;
      req.ingestTokenId = record.id;
      // Registrar o uso é o que permite descobrir na tela qual token está
      // vivo e qual você pode revogar sem medo.
      await prisma.ingestToken.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      });
      next();
    })
    .catch(next);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ingestTokenId?: string;
    }
  }
}
