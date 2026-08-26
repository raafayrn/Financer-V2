import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import { requireIngestToken } from '../auth/ingestToken';
import { asyncHandler, parseBody } from '../lib/http';
import { centsToReais, reaisToCents } from '../lib/money';
import { matchCategoryByName } from '../lib/categoryMatch';
import { parseIngestion } from '../lib/ingestParse';
import { findDuplicate, mergeIntoExisting } from '../lib/ingestDedupe';
import { formatCurrencyBRL } from '../lib/format';
import { ingestSchema } from '../validation/schemas';

export const ingestRouter = Router();

/**
 * Ingestão automática de lançamentos (POST /api/expenses/ingest).
 *
 * Os dois canais externos caem aqui e NADA vira Expense/Income direto: tudo
 * entra como pendente e espera confirmação na tela. É o que impede um aviso
 * do banco de mexer sozinho no "ainda posso gastar".
 *
 * A autenticação é por token de ingestão, não pelo JWT da sessão — ver
 * auth/ingestToken.ts.
 */

// Um humano paga com o cartão algumas vezes por hora, não centenas. O limite
// existe menos pela carga e mais para que um token vazado não vire uma
// enxurrada de pendentes (e de chamadas pagas ao parser).
const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas ingestões seguidas. Tente de novo em um minuto.' },
});

ingestRouter.post(
  '/ingest',
  ingestLimiter,
  requireIngestToken,
  asyncHandler(async (req, res) => {
    const payload = parseBody(ingestSchema, req.body);
    const userId = req.userId as string;

    const receivedAt =
      payload.source === 'email' && payload.received_at
        ? new Date(payload.received_at)
        : new Date();
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const parsed = await parseIngestion({
      source: payload.source,
      text: payload.source === 'wallet_shortcut' ? payload.text : undefined,
      subject: payload.source === 'email' ? payload.subject : undefined,
      bodyText: payload.source === 'email' ? payload.body_text : undefined,
      categories: categories.map((c) => c.name),
    });

    // A hora da compra: no atalho vem do payload do iPhone; no e-mail sai do
    // corpo lido pelo parser. É sobre ela que a deduplicação vai medir os 15
    // minutos, então uma hora errada aqui vira lançamento em dobro depois.
    const occurredAt =
      payload.source === 'wallet_shortcut'
        ? new Date(payload.occurred_at)
        : parsed.occurredAt
          ? new Date(parsed.occurredAt)
          : null;

    // O payload original é guardado íntegro: se o parser errar, é daqui que
    // dá para reprocessar sem perda.
    const ingestion = await prisma.expenseIngestion.create({
      data: {
        userId,
        source: payload.source,
        status: 'pending',
        amount: parsed.valor === null ? null : reaisToCents(parsed.valor),
        merchant:
          parsed.estabelecimento ||
          (payload.source === 'wallet_shortcut' ? payload.text : (payload.subject ?? '')),
        categoryId: matchCategoryByName(parsed.categoria, categories),
        suggestedCategory: parsed.categoria,
        transactionType: parsed.transactionType,
        parseConfidence: parsed.confianca,
        occurredAt,
        receivedAt,
        rawPayload: JSON.stringify(payload),
      },
    });

    // Só depois de gravar procuramos a duplicata: o registro precisa existir
    // no banco para poder ser referenciado por `mergedFrom` — sem isso,
    // "desfazer fusão" não teria a que voltar.
    const duplicate = await findDuplicate(prisma, {
      userId,
      amount: ingestion.amount,
      occurredAt: ingestion.occurredAt,
      transactionType: ingestion.transactionType,
      source: ingestion.source,
      excludeId: ingestion.id,
    });

    let outcome: 'created' | 'merged' | 'ignored' = 'created';
    let saved = ingestion;

    if (duplicate) {
      saved = await mergeIntoExisting(prisma, duplicate, ingestion);
      // "merged" quando o novo trouxe dados melhores (e-mail sobre atalho);
      // "ignored" quando era só a mesma coisa de novo.
      outcome = saved.source === 'email+shortcut' ? 'merged' : 'ignored';
    }

    const amountReais = saved.amount === null ? null : centsToReais(saved.amount);

    res.status(201).json({
      status: outcome,
      expense: {
        id: saved.id,
        amount: amountReais,
        merchant: saved.merchant,
        category: parsed.categoria,
        status: saved.status,
      },
      // O Atalho do iPhone mostra este texto numa notificação — é a única
      // confirmação visual que o usuário recebe depois de pagar.
      message:
        amountReais === null
          ? 'Registrado como pendente. Confirme no app.'
          : outcome === 'created'
            ? `${formatCurrencyBRL(amountReais)} registrado como pendente`
            : `${formatCurrencyBRL(amountReais)} já registrado — nada foi duplicado`,
    });
  }),
);
