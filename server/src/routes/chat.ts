import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import {
  chatAskSchema,
  chatFileSchema,
  chatImageSchema,
  chatInvoicePdfSchema,
  chatMessageSchema,
  chatParseSchema,
} from '../validation/schemas';
import { env } from '../env';
import {
  parseExpenseFromText,
  parseExpensesFromImage,
  parseExpensesFromInvoiceText,
  parseExpensesFromCsvText,
  answerFinancialQuestion,
  classifyAndParseMessage,
} from '../services/claude';
import { PDFParse } from 'pdf-parse';
import { decodeText, parseOfxExpenses } from '../lib/statementParsers';
import { buildFinancialContext } from '../lib/financialContext';
import { currentYearMonth } from '../lib/month';
import type { ParsedExpense } from '../services/claude';

export const chatRouter = Router();

chatRouter.use(requireAuth);

// Informa ao frontend se o recurso de chat está disponível (chave configurada).
chatRouter.get('/status', (_req, res) => {
  res.json({ enabled: env.chatEnabled });
});

// Cada chamada às rotas abaixo custa créditos na API da Anthropic — limita
// para evitar uso excessivo (acidental ou malicioso) por usuário autenticado.
const chatCallLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'unknown',
  message: { ok: false, message: 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.' },
});
chatRouter.use(chatCallLimiter);

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

/** Lança 503 se a chave da Anthropic não estiver configurada. */
function requireChatEnabled(message: string) {
  if (!env.chatEnabled) {
    throw new HttpError(503, message);
  }
}

async function fetchCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Filtra despesas com valor válido e devolve o mesmo formato de resposta em todas as rotas de parse. */
function respondWithExpenses(
  res: import('express').Response,
  result: { expenses: ParsedExpense[]; aviso: string | null },
  categories: { id: string; name: string }[],
  fallbackText: string,
  emptyMessage: string,
) {
  const valid = result.expenses.filter((e) => e.valor !== null && e.valor > 0);
  if (valid.length === 0) {
    res.json({ ok: false, message: result.aviso ?? emptyMessage });
    return;
  }
  res.json({ ok: true, previews: valid.map((e) => toPreview(e, categories, fallbackText)) });
}

/** Extrai o texto de um PDF em base64, lançando um erro amigável se falhar. */
async function readPdfText(pdfBase64: string): Promise<string> {
  try {
    const parser = new PDFParse({ data: Buffer.from(pdfBase64, 'base64') });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (err) {
    console.error('Falha ao ler o PDF:', err);
    throw new HttpError(400, 'Não foi possível ler esse PDF. Verifique se o arquivo não está corrompido.');
  }
}

/**
 * Interpreta uma frase em linguagem natural e devolve um PREVIEW do lançamento
 * para o usuário confirmar/editar. NÃO salva nada no banco.
 * POST /api/chat/parse  { text }
 */
chatRouter.post(
  '/parse',
  asyncHandler(async (req, res) => {
    requireChatEnabled(
      'Lançamento por chat indisponível: a chave da API da Anthropic (Claude) não está configurada no servidor.',
    );

    const { text } = parseBody(chatParseSchema, req.body);
    const userId = req.userId!;

    const categories = await fetchCategories(userId);

    const today = new Date().toISOString().slice(0, 10);

    let parsed;
    try {
      parsed = await parseExpenseFromText(
        text,
        categories.map((c) => c.name),
        today,
      );
    } catch (err) {
      console.error('Falha ao chamar a API da Anthropic (Claude):', err);
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
    requireChatEnabled(
      'Lançamento por chat indisponível: a chave da API da Anthropic (Claude) não está configurada no servidor.',
    );

    const { imageBase64, mimeType } = parseBody(chatImageSchema, req.body);
    const userId = req.userId!;

    const categories = await fetchCategories(userId);
    const today = new Date().toISOString().slice(0, 10);

    let result;
    try {
      result = await parseExpensesFromImage(imageBase64, mimeType, categories.map((c) => c.name), today);
    } catch (err) {
      console.error('Falha ao chamar a API da Anthropic (Claude) (imagem):', err);
      throw new HttpError(
        502,
        'Não foi possível interpretar a imagem agora. Tente novamente ou lance manualmente.',
      );
    }

    respondWithExpenses(res, result, categories, 'Compra', 'Não consegui identificar nenhuma despesa nessa imagem.');
  }),
);

/**
 * Interpreta uma fatura de cartão em PDF: extrai o texto localmente
 * (pdf-parse) e manda pro Claude identificar todas as transações. Devolve
 * um PREVIEW por lançamento para o usuário confirmar/editar, igual à foto.
 * POST /api/chat/parse-invoice-pdf  { pdfBase64 }
 */
chatRouter.post(
  '/parse-invoice-pdf',
  asyncHandler(async (req, res) => {
    requireChatEnabled('Lançamento por chat indisponível: a chave da API não está configurada no servidor.');

    const { pdfBase64 } = parseBody(chatInvoicePdfSchema, req.body);
    const userId = req.userId!;

    const invoiceText = await readPdfText(pdfBase64);

    if (!invoiceText.trim()) {
      res.json({
        ok: false,
        message: 'Não encontrei texto nesse PDF. Se for uma fatura escaneada (imagem), envie uma foto em vez do PDF.',
      });
      return;
    }

    const categories = await fetchCategories(userId);
    const today = new Date().toISOString().slice(0, 10);

    let result;
    try {
      result = await parseExpensesFromInvoiceText(invoiceText, categories.map((c) => c.name), today);
    } catch (err) {
      console.error('Falha ao chamar a API do Claude (fatura PDF):', err);
      throw new HttpError(
        502,
        'Não foi possível interpretar a fatura agora. Tente novamente ou lance manualmente.',
      );
    }

    respondWithExpenses(res, result, categories, 'Fatura', 'Não consegui identificar nenhuma transação nessa fatura.');
  }),
);

/**
 * Endpoint único do botão de anexo do chat: aceita foto, PDF, CSV ou OFX e
 * detecta o formato pela extensão do nome do arquivo (com fallback no
 * mimeType). Sempre devolve o mesmo formato de resposta ({ ok, previews }
 * ou { ok: false, message }) para reaproveitar a mesma tela de confirmação.
 * POST /api/chat/parse-file  { fileBase64, mimeType, fileName }
 */
chatRouter.post(
  '/parse-file',
  asyncHandler(async (req, res) => {
    requireChatEnabled('Lançamento por chat indisponível: a chave da API não está configurada no servidor.');

    const { fileBase64, mimeType, fileName } = parseBody(chatFileSchema, req.body);
    const userId = req.userId!;
    const today = new Date().toISOString().slice(0, 10);

    const categories = await fetchCategories(userId);

    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    const isImage = mimeType.startsWith('image/');
    const isPdf = ext === 'pdf' || mimeType === 'application/pdf';
    const isCsv = ext === 'csv' || mimeType.includes('csv');
    const isOfx = ext === 'ofx' || mimeType.includes('ofx');

    // --- Foto de comprovante/nota ---
    if (isImage) {
      let result;
      try {
        result = await parseExpensesFromImage(fileBase64, mimeType, categories.map((c) => c.name), today);
      } catch (err) {
        console.error('Falha ao chamar a API do Claude (imagem):', err);
        throw new HttpError(502, 'Não foi possível interpretar a imagem agora. Tente novamente ou lance manualmente.');
      }
      respondWithExpenses(res, result, categories, 'Compra', 'Não consegui identificar nenhuma despesa nessa imagem.');
      return;
    }

    // --- Fatura em PDF ---
    if (isPdf) {
      const invoiceText = await readPdfText(fileBase64);
      if (!invoiceText.trim()) {
        res.json({
          ok: false,
          message: 'Não encontrei texto nesse PDF. Se for uma fatura escaneada (imagem), envie uma foto em vez do PDF.',
        });
        return;
      }
      let result;
      try {
        result = await parseExpensesFromInvoiceText(invoiceText, categories.map((c) => c.name), today);
      } catch (err) {
        console.error('Falha ao chamar a API do Claude (PDF):', err);
        throw new HttpError(502, 'Não foi possível interpretar a fatura agora. Tente novamente ou lance manualmente.');
      }
      respondWithExpenses(res, result, categories, 'Fatura', 'Não consegui identificar nenhuma transação nessa fatura.');
      return;
    }

    // --- OFX: parser determinístico, sem IA ---
    if (isOfx) {
      const text = decodeText(Buffer.from(fileBase64, 'base64'));
      if (!text.trim()) {
        res.json({ ok: false, message: 'Arquivo OFX vazio ou ilegível.' });
        return;
      }
      const raw = parseOfxExpenses(text);
      if (raw.length === 0) {
        res.json({ ok: false, message: 'Não encontrei transações de despesa nesse OFX.' });
        return;
      }
      res.json({
        ok: true,
        previews: raw.map((r) =>
          toPreview({ valor: r.amount, descricao: r.description, categoria: null, data: r.date, aviso: null }, categories, 'Transação'),
        ),
      });
      return;
    }

    // --- CSV: colunas variam por banco, deixa o Claude detectar ---
    if (isCsv) {
      const text = decodeText(Buffer.from(fileBase64, 'base64'));
      if (!text.trim()) {
        res.json({ ok: false, message: 'Arquivo CSV vazio ou ilegível.' });
        return;
      }
      let result;
      try {
        result = await parseExpensesFromCsvText(text, categories.map((c) => c.name), today);
      } catch (err) {
        console.error('Falha ao chamar a API do Claude (CSV):', err);
        throw new HttpError(502, 'Não foi possível interpretar o CSV agora. Tente novamente ou lance manualmente.');
      }
      respondWithExpenses(res, result, categories, 'Transação', 'Não consegui identificar nenhuma transação nesse CSV.');
      return;
    }

    res.json({
      ok: false,
      message: 'Formato de arquivo não suportado. Envie uma foto, PDF, CSV ou OFX.',
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
    requireChatEnabled(
      'Assistente indisponível: a chave da API da Anthropic (Claude) não está configurada no servidor.',
    );

    const { question } = parseBody(chatAskSchema, req.body);
    const userId = req.userId!;
    const { year, month } = currentYearMonth();
    const today = new Date().toISOString().slice(0, 10);

    const context = await buildFinancialContext(userId, year, month);

    let answer: string;
    try {
      answer = await answerFinancialQuestion(question, context, today);
    } catch (err) {
      console.error('Falha ao chamar a API da Anthropic (Claude) (pergunta):', err);
      throw new HttpError(502, 'Não foi possível responder agora. Tente novamente.');
    }

    res.json({ answer });
  }),
);

/**
 * Endpoint unificado: detecta automaticamente a intenção (despesa, receita,
 * pergunta ou chat livre) sem o usuário precisar escolher um modo.
 * POST /api/chat/message  { text }
 */
chatRouter.post(
  '/message',
  asyncHandler(async (req, res) => {
    requireChatEnabled(
      'Assistente indisponível: a chave da API da Anthropic (Claude) não está configurada no servidor.',
    );

    const { text } = parseBody(chatMessageSchema, req.body);
    const userId = req.userId!;
    const today = new Date().toISOString().slice(0, 10);

    const categories = await fetchCategories(userId);

    let classified;
    try {
      classified = await classifyAndParseMessage(text, categories.map((c) => c.name), today);
    } catch (err) {
      console.error('Falha ao classificar mensagem:', err);
      throw new HttpError(502, 'Não foi possível processar a mensagem agora. Tente novamente.');
    }

    if (classified.intent === 'despesa') {
      if (classified.valor === null || classified.valor <= 0) {
        res.json({
          ok: false,
          message: classified.aviso ?? 'Não consegui identificar o valor. Reformule (ex.: "gastei 50 no mercado").',
        });
        return;
      }
      res.json({
        ok: true,
        intent: 'despesa',
        preview: toPreview(
          { valor: classified.valor, descricao: classified.descricao, categoria: classified.categoria, data: classified.data, aviso: null },
          categories,
          text,
        ),
      });
      return;
    }

    if (classified.intent === 'receita') {
      if (classified.valor === null || classified.valor <= 0) {
        res.json({
          ok: false,
          message: classified.aviso ?? 'Não consegui identificar o valor. Reformule (ex.: "recebi 200 de freela").',
        });
        return;
      }
      res.json({
        ok: true,
        intent: 'receita',
        incomePreview: {
          description: classified.descricao || text,
          amount: classified.valor,
          date: classified.data,
        },
      });
      return;
    }

    if (classified.intent === 'pergunta') {
      const { year, month } = currentYearMonth();
      const context = await buildFinancialContext(userId, year, month);
      let answer: string;
      try {
        answer = await answerFinancialQuestion(text, context, today);
      } catch (err) {
        console.error('Falha ao responder pergunta:', err);
        throw new HttpError(502, 'Não foi possível responder agora. Tente novamente.');
      }
      res.json({ ok: true, intent: 'pergunta', answer });
      return;
    }

    // desconhecido
    res.json({
      ok: false,
      message: classified.aviso ?? 'Não entendi. Tente descrever um gasto, uma receita ou faça uma pergunta sobre suas finanças.',
    });
  }),
);
