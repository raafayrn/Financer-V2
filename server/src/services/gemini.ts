import { GoogleGenAI } from '@google/genai';
import { env } from '../env';

export interface ParsedExpense {
  /** Valor em reais (número). null quando a IA não conseguiu identificar. */
  valor: number | null;
  descricao: string;
  /** Nome de categoria sugerida (deve estar entre as existentes ou null). */
  categoria: string | null;
  /** Data no formato AAAA-MM-DD. */
  data: string;
  /** Mensagem curta para o usuário quando não foi possível extrair o valor. */
  aviso: string | null;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return client;
}

function categoryContext(categories: string[]): string {
  return categories.length > 0
    ? categories.map((c) => `- ${c}`).join('\n')
    : '(o usuário ainda não cadastrou categorias)';
}

// Schema JSON estrito de um lançamento — reutilizado tanto na extração por
// texto quanto por imagem (onde vira um item de um array).
const EXPENSE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    valor: {
      type: ['number', 'null'],
      description:
        'Valor da despesa em reais (ex.: 150.0). null se não houver valor claro.',
    },
    descricao: {
      type: 'string',
      description:
        'Descrição curta e legível da despesa (ex.: "Loja de materiais de construção").',
    },
    categoria: {
      type: ['string', 'null'],
      description:
        'Nome de UMA das categorias existentes do usuário que melhor se encaixa, ou null se nenhuma se encaixar.',
    },
    data: {
      type: 'string',
      description:
        'Data da despesa no formato AAAA-MM-DD. Interprete termos relativos (hoje, ontem, anteontem) em relação à data atual informada.',
    },
  },
  required: ['valor', 'descricao', 'categoria', 'data'],
};

const TEXT_EXTRACTION_SCHEMA = {
  ...EXPENSE_ITEM_SCHEMA,
  properties: {
    ...EXPENSE_ITEM_SCHEMA.properties,
    aviso: {
      type: ['string', 'null'],
      description:
        'Se não foi possível identificar um valor claro, uma mensagem curta pedindo para o usuário reformular. Caso contrário, null.',
    },
  },
  required: [...EXPENSE_ITEM_SCHEMA.required, 'aviso'],
};

const IMAGE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    lancamentos: {
      type: 'array',
      description: 'Uma despesa para cada compra distinta identificada na imagem.',
      items: EXPENSE_ITEM_SCHEMA,
    },
    aviso: {
      type: ['string', 'null'],
      description:
        'Se a imagem não continha nenhuma despesa legível, uma mensagem curta explicando. Caso contrário, null.',
    },
  },
  required: ['lancamentos', 'aviso'],
};

function toParsedExpense(raw: unknown, today: string): ParsedExpense {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  const valor = typeof parsed.valor === 'number' ? parsed.valor : null;
  const descricao = typeof parsed.descricao === 'string' ? parsed.descricao : '';
  const categoria = typeof parsed.categoria === 'string' ? parsed.categoria : null;
  const data =
    typeof parsed.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data)
      ? parsed.data
      : today;
  const aviso = typeof parsed.aviso === 'string' ? parsed.aviso : null;
  return { valor, descricao, categoria, data, aviso };
}

/**
 * Envia o texto do usuário para o Gemini e retorna o lançamento estruturado.
 * A chave da API nunca sai do backend.
 */
export async function parseExpenseFromText(
  text: string,
  categories: string[],
  today: string, // AAAA-MM-DD
): Promise<ParsedExpense> {
  const systemInstruction = [
    'Você extrai lançamentos de despesas a partir de frases em português brasileiro.',
    `A data de hoje é ${today}. Use-a para resolver termos relativos como "hoje", "ontem", "anteontem".`,
    'Interprete valores em reais. "150", "150 reais", "R$ 150,00" e "cento e cinquenta" significam 150.0.',
    'Escolha a categoria APENAS entre as categorias existentes do usuário listadas abaixo. Se nenhuma se encaixar bem, use null.',
    'Categorias existentes do usuário:',
    categoryContext(categories),
    'Responda SOMENTE com o JSON no formato pedido. Se não houver um valor claro na frase, defina valor como null e preencha aviso.',
  ].join('\n');

  const interaction = await getClient().interactions.create({
    model: env.geminiModel,
    system_instruction: systemInstruction,
    input: text,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: TEXT_EXTRACTION_SCHEMA,
    },
  });

  if (!interaction.output_text) {
    throw new Error('O Gemini não retornou texto na resposta.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw new Error('O Gemini não retornou um JSON válido.');
  }

  return toParsedExpense(parsed, today);
}

/**
 * Envia uma foto de comprovante/nota (base64) para o Gemini e retorna UMA OU
 * MAIS despesas identificadas na imagem (ex.: várias compras num mesmo
 * comprovante, ou várias notas fotografadas juntas).
 */
export async function parseExpensesFromImage(
  imageBase64: string,
  mimeType: string,
  categories: string[],
  today: string,
): Promise<{ expenses: ParsedExpense[]; aviso: string | null }> {
  const systemInstruction = [
    'Você extrai lançamentos de despesas a partir de uma foto de nota fiscal, comprovante ou print de compra.',
    `A data de hoje é ${today}. Se a imagem não tiver data legível, use a data de hoje.`,
    'Se a imagem mostrar VÁRIAS compras distintas (vários itens de uma nota, ou várias notas na mesma foto), retorne um lançamento para CADA uma. Se for uma única compra, retorne apenas um item.',
    'Escolha a categoria APENAS entre as categorias existentes do usuário listadas abaixo. Se nenhuma se encaixar bem, use null.',
    'Categorias existentes do usuário:',
    categoryContext(categories),
    'Responda SOMENTE com o JSON no formato pedido. Se a imagem não tiver nenhuma despesa legível, retorne lancamentos como lista vazia e preencha aviso.',
  ].join('\n');

  const interaction = await getClient().interactions.create({
    model: env.geminiModel,
    system_instruction: systemInstruction,
    input: [
      { type: 'image', data: imageBase64, mime_type: mimeType },
      { type: 'text', text: 'Extraia os lançamentos desta imagem.' },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: IMAGE_EXTRACTION_SCHEMA,
    },
  });

  if (!interaction.output_text) {
    throw new Error('O Gemini não retornou texto na resposta.');
  }

  let parsed: { lancamentos?: unknown[]; aviso?: unknown };
  try {
    parsed = JSON.parse(interaction.output_text);
  } catch {
    throw new Error('O Gemini não retornou um JSON válido.');
  }

  const expenses = Array.isArray(parsed.lancamentos)
    ? parsed.lancamentos.map((item) => toParsedExpense(item, today))
    : [];
  const aviso = typeof parsed.aviso === 'string' ? parsed.aviso : null;

  return { expenses, aviso };
}

/**
 * Responde uma pergunta em linguagem natural sobre as finanças do usuário,
 * usando um resumo de dados reais (montado pelo backend a partir do banco)
 * como contexto — o Gemini não inventa números, só interpreta o que foi
 * fornecido em `dataContext`.
 */
export async function answerFinancialQuestion(
  question: string,
  dataContext: string,
  today: string,
): Promise<string> {
  const systemInstruction = [
    'Você é um assistente financeiro pessoal. Responda em português brasileiro, de forma direta e curta (2-4 frases).',
    `A data de hoje é ${today}.`,
    'Use APENAS os dados fornecidos abaixo para responder — não invente valores. Se a pergunta não puder ser respondida com esses dados, diga isso claramente.',
    'Formate valores em reais como R$ 1.234,56.',
    '--- DADOS DISPONÍVEIS ---',
    dataContext,
  ].join('\n');

  const interaction = await getClient().interactions.create({
    model: env.geminiModel,
    system_instruction: systemInstruction,
    input: question,
  });

  return interaction.output_text ?? 'Não consegui gerar uma resposta agora.';
}
