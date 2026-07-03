import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { chatAskSchema, chatImageSchema, chatParseSchema } from '../validation/schemas';
import { env } from '../env';
import { parseExpenseFromText, parseExpensesFromImage, answerFinancialQuestion } from '../services/gemini';
import { buildFinancialContext } from '../lib/financialContext';
import { currentYearMonth } from '../lib/month';
import type { ParsedExpense } from '../services/gemini';

export const chatRouter = Router();

chatRouter.use(requireAuth);

// Informa ao frontend se o recurso de chat está disponível (chave configurada).
chatRouter.get('/status', (_req, res) => {
  res.json({ enabled: env.chatEnabled });
});

/** Casa a categoria sugerida pela IA com uma categoria real do usuário (case-insensitive). */
function matchCategory(
  suggested: string | null,
  categories: { id: string; name: string }[],
): string | null {
  const normalized = suggested?.trim().toLowerCase() ?? null;
  if (!normalized) return null;
  return categories.find((c) => c.name.toLowerCase() === normalized)?.id ?? null;
}

function toPreview(parsed: ParsedExpense, categories: { id: string; name: string }[], fallbackText: string) {
  return {
    description: parsed.descricao || fallbackText,
    amount: parsed.valor as number,
    date: parsed.data,
    categoryId: matchCategory(parsed.categoria, categories),
    suggestedCategoryName: parsed.categoria ?? null,
    recurring: false,
  };
}

/**
 * Interpreta uma frase em linguagem natural e devolve um PREVIEW do lançamento
 * para o usuário confirmar/editar. NÃO salva nada no banco.
 * POST /api/chat/parse  { text }
 */
chatRouter.post(
  '/parse',
  asyncHandler(async (req, res) => {
    if (!env.chatEnabled) {
      throw new HttpError(
        503,
        'Lançamento por chat indisponível: a chave da API do Gemini não está configurada no servidor.',
      );
    }

    const { text } = parseBody(chatParseSchema, req.body);
    const userId = req.userId!;

    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const today = new Date().toISOString().slice(0, 10);

    let parsed;
    try {
      parsed = await parseExpenseFromText(
        text,
        categories.map((c) => c.name),
        today,
      );
    } catch (err) {
      console.error('Falha ao chamar a API do Gemini:', err);
      throw new HttpError(
        502,
        'Não foi possível interpretar a mensagem agora. Tente novamente ou lance manualmente.',
      );
    }

    // Sem valor claro -> avisa o usuário para reformular ou preencher à mão.
    if (parsed.valor === null || parsed.valor <= 0) {
      res.json({
        ok: false,
        message:
          parsed.aviso ??
          'Não consegui identificar um valor na mensagem. Reformule (ex.: "gastei 150 na farmácia") ou lance manualmente.',
      });
      return;
    }

    res.json({ ok: true, preview: toPreview(parsed, categories, text) });
  }),
);

/**
 * Interpreta uma foto de comprovante/nota e devolve um ou mais PREVIEWS de
 * lançamento para o usuário confirmar/editar. NÃO salva nada no banco.
 * POST /api/chat/parse-image  { imageBase64, mimeType }
 */
chatRouter.post(
  '/parse-image',
  asyncHandler(async (req, res) => {
    if (!env.chatEnabled) {
      throw new HttpError(
        503,
        'Lançamento por chat indisponível: a chave da API do Gemini não está configurada no servidor.',
      );
    }

    const { imageBase64, mimeType } = parseBody(chatImageSchema, req.body);
    const userId = req.userId!;

    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const today = new Date().toISOString().slice(0, 10);

    let result;
    try {
      result = await parseExpensesFromImage(imageBase64, mimeType, categories.map((c) => c.name), today);
    } catch (err) {
      console.error('Falha ao chamar a API do Gemini (imagem):', err);
      throw new HttpError(
        502,
        'Não foi possível interpretar a imagem agora. Tente novamente ou lance manualmente.',
      );
    }

    const valid = result.expenses.filter((e) => e.valor !== null && e.valor > 0);

    if (valid.length === 0) {
      res.json({
        ok: false,
        message: result.aviso ?? 'Não consegui identificar nenhuma despesa nessa imagem.',
      });
      return;
    }

    res.json({
      ok: true,
      previews: valid.map((e) => toPreview(e, categories, 'Compra')),
    });
  }),
);

/**
 * Responde uma pergunta em linguagem natural sobre os dados financeiros
 * reais do usuário (mês atual + anterior, saldo da carteira).
 * POST /api/chat/ask  { question }
 */
chatRouter.post(
  '/ask',
  asyncHandler(async (req, res) => {
    if (!env.chatEnabled) {
      throw new HttpError(
        503,
        'Assistente indisponível: a chave da API do Gemini não está configurada no servidor.',
      );
    }

    const { question } = parseBody(chatAskSchema, req.body);
    const userId = req.userId!;
    const { year, month } = currentYearMonth();
    const today = new Date().toISOString().slice(0, 10);

    const context = await buildFinancialContext(userId, year, month);

    let answer: string;
    try {
      answer = await answerFinancialQuestion(question, context, today);
    } catch (err) {
      console.error('Falha ao chamar a API do Gemini (pergunta):', err);
      throw new HttpError(502, 'Não foi possível responder agora. Tente novamente.');
    }

    res.json({ answer });
  }),
);
