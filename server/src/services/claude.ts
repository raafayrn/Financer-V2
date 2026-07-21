import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

export interface ParsedExpense {
  valor: number | null;
  descricao: string;
  categoria: string | null;
  data: string;
  aviso: string | null;
}

export interface ClassifiedMessage {
  intent: 'despesa' | 'receita' | 'pergunta' | 'desconhecido';
  valor: number | null;
  descricao: string;
  categoria: string | null;
  data: string;
  aviso: string | null;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

function categoryContext(categories: string[]): string {
  return categories.length > 0
    ? categories.map((c) => `- ${c}`).join('\n')
    : '(o usuário ainda não cadastrou categorias)';
}

async function ask(system: string, userPrompt: string): Promise<string> {
  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Claude não retornou texto.');
  return block.text;
}

function parseJson(text: string): unknown {
  const clean = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(clean);
}

function toParsedExpense(raw: unknown, today: string): ParsedExpense {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    valor: typeof p.valor === 'number' ? p.valor : null,
    descricao: typeof p.descricao === 'string' ? p.descricao : '',
    categoria: typeof p.categoria === 'string' ? p.categoria : null,
    data: typeof p.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : today,
    aviso: typeof p.aviso === 'string' ? p.aviso : null,
  };
}

export async function parseExpenseFromText(
  text: string,
  categories: string[],
  today: string,
): Promise<ParsedExpense> {
  const system = [
    'Você extrai lançamentos de despesas a partir de frases em português brasileiro.',
    `A data de hoje é ${today}. Resolva termos relativos como "hoje", "ontem", "anteontem".`,
    'Interprete valores em reais: "150", "150 reais", "R$ 150,00", "cento e cinquenta" = 150.0.',
    'Escolha a categoria APENAS entre as listadas abaixo. Se nenhuma se encaixar, use null.',
    'Categorias:', categoryContext(categories),
    'Responda SOMENTE com JSON: {"valor": number|null, "descricao": string, "categoria": string|null, "data": "AAAA-MM-DD", "aviso": string|null}',
    'Se não houver valor claro, defina valor como null e preencha aviso.',
  ].join('\n');

  const raw = await ask(system, text);
  return toParsedExpense(parseJson(raw), today);
}

export async function parseExpensesFromImage(
  imageBase64: string,
  mimeType: string,
  categories: string[],
  today: string,
): Promise<{ expenses: ParsedExpense[]; aviso: string | null }> {
  const system = [
    'Você extrai lançamentos de despesas a partir de uma foto de nota fiscal ou comprovante.',
    `A data de hoje é ${today}. Se a imagem não tiver data legível, use hoje.`,
    'Se houver várias compras distintas, retorne um lançamento para cada uma.',
    'Escolha a categoria APENAS entre as listadas abaixo. Se nenhuma se encaixar, use null.',
    'Categorias:', categoryContext(categories),
    'Responda SOMENTE com JSON: {"lancamentos": [{"valor": number, "descricao": string, "categoria": string|null, "data": "AAAA-MM-DD"}], "aviso": string|null}',
  ].join('\n');

  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Extraia os lançamentos desta imagem.' },
      ],
    }],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Claude não retornou texto.');
  const parsed = parseJson(block.text) as { lancamentos?: unknown[]; aviso?: unknown };

  return {
    expenses: Array.isArray(parsed.lancamentos)
      ? parsed.lancamentos.map((item) => toParsedExpense(item, today))
      : [],
    aviso: typeof parsed.aviso === 'string' ? parsed.aviso : null,
  };
}

/**
 * Extrai lançamentos de despesa a partir do TEXTO de uma fatura de cartão em
 * PDF (já extraído pelo backend com pdf-parse). Cobre tanto compras quanto
 * financiamentos/parcelamentos que aparecem na fatura, e ignora pagamentos
 * recebidos (que reduzem o saldo devedor, não são despesas).
 */
export async function parseExpensesFromInvoiceText(
  invoiceText: string,
  categories: string[],
  today: string,
): Promise<{ expenses: ParsedExpense[]; aviso: string | null }> {
  const system = [
    'Você extrai lançamentos de despesa a partir do texto de uma fatura de cartão de crédito brasileira (ex.: Nubank, Itaú, etc.).',
    `A data de hoje é ${today}, usada apenas como fallback se não houver nenhuma data no texto.`,
    'As linhas de transação geralmente mostram só dia e mês abreviado (ex.: "03 ABR"), sem ano — procure o ano correto em outras partes do texto da fatura (ex.: "FATURA 08 MAI 2026", "Período vigente: 01 ABR a 01 MAI") e use-o para montar a data completa AAAA-MM-DD de cada transação.',
    'Inclua tanto as compras normais quanto lançamentos de parcelamento/financiamento/empréstimo (ex.: seções "Pagamentos e Financiamentos", "Pix parcelado") que representam dinheiro que SAIU — use o valor total cobrado nesta fatura para cada um (o valor ao lado do nome/data, não o "valor da transação" isolado do parênteses).',
    'NÃO inclua: pagamentos recebidos (valores negativos, ex.: "Pagamento em ... −R$ ..."), "saldo restante da fatura anterior" quando for R$ 0,00, nem totais/resumos gerais da fatura.',
    'Escolha a categoria APENAS entre as listadas abaixo, pelo nome do estabelecimento. Se nenhuma se encaixar, use null.',
    'Categorias:', categoryContext(categories),
    'Responda SOMENTE com JSON: {"lancamentos": [{"valor": number, "descricao": string, "categoria": string|null, "data": "AAAA-MM-DD"}], "aviso": string|null}',
    'Se o texto não tiver nenhuma transação reconhecível, retorne lancamentos como lista vazia e preencha aviso.',
  ].join('\n');

  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: `Texto da fatura:\n\n${invoiceText}` }],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Claude não retornou texto.');
  const parsed = parseJson(block.text) as { lancamentos?: unknown[]; aviso?: unknown };

  return {
    expenses: Array.isArray(parsed.lancamentos)
      ? parsed.lancamentos.map((item) => toParsedExpense(item, today))
      : [],
    aviso: typeof parsed.aviso === 'string' ? parsed.aviso : null,
  };
}

/**
 * Extrai lançamentos de despesa a partir do TEXTO de um extrato/fatura em
 * CSV exportado pelo banco. O formato de colunas varia muito entre bancos,
 * então deixamos o Claude detectar as colunas em vez de um parser rígido.
 */
export async function parseExpensesFromCsvText(
  csvText: string,
  categories: string[],
  today: string,
): Promise<{ expenses: ParsedExpense[]; aviso: string | null }> {
  const system = [
    'Você extrai lançamentos de despesa a partir de um CSV de extrato/fatura de banco brasileiro.',
    `A data de hoje é ${today}, usada apenas como fallback se não houver data em alguma linha.`,
    'A primeira linha costuma ser o cabeçalho — identifique sozinho quais colunas são data, descrição/estabelecimento e valor (os nomes variam por banco).',
    'Datas podem vir em formatos como DD/MM/AAAA ou AAAA-MM-DD — converta sempre para AAAA-MM-DD.',
    'Inclua apenas despesas (compras, saques, parcelamentos). NÃO inclua pagamentos recebidos, estornos ou créditos (geralmente valores negativos numa coluna de despesas, ou marcados como "pagamento"/"crédito"/"estorno").',
    'Escolha a categoria APENAS entre as listadas abaixo, pelo nome do estabelecimento/descrição. Se nenhuma se encaixar, use null.',
    'Categorias:', categoryContext(categories),
    'Responda SOMENTE com JSON: {"lancamentos": [{"valor": number, "descricao": string, "categoria": string|null, "data": "AAAA-MM-DD"}], "aviso": string|null}',
    'Se o CSV não tiver nenhuma transação reconhecível, retorne lancamentos como lista vazia e preencha aviso.',
  ].join('\n');

  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: `CSV:\n\n${csvText}` }],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Claude não retornou texto.');
  const parsed = parseJson(block.text) as { lancamentos?: unknown[]; aviso?: unknown };

  return {
    expenses: Array.isArray(parsed.lancamentos)
      ? parsed.lancamentos.map((item) => toParsedExpense(item, today))
      : [],
    aviso: typeof parsed.aviso === 'string' ? parsed.aviso : null,
  };
}

export async function classifyAndParseMessage(
  text: string,
  categories: string[],
  today: string,
): Promise<ClassifiedMessage> {
  const system = [
    'Você é um assistente financeiro pessoal. Analise a mensagem e classifique a intenção.',
    `A data de hoje é ${today}.`,
    'Interprete valores em reais: "150", "150 reais", "R$ 150,00", "cento e cinquenta" = 150.0.',
    'CALCULE multiplicações: "3 monsters a R$ 11" = 33.0, "2 cafés de 5 reais" = 10.0.',
    'Categorias disponíveis (use APENAS estas para despesas):',
    categoryContext(categories),
    'Responda SOMENTE com JSON:',
    '{"intent": "despesa"|"receita"|"pergunta"|"desconhecido", "valor": number|null, "descricao": string, "categoria": string|null, "data": "AAAA-MM-DD", "aviso": string|null}',
    'intent: despesa=gastou; receita=recebeu/ganhou; pergunta=quer saber algo sobre finanças; desconhecido=outro.',
    'valor: null para perguntas e desconhecido. categoria: apenas para despesas.',
  ].join('\n');

  const raw = await ask(system, text);
  const p = parseJson(raw) as Record<string, unknown>;

  const intent = ['despesa', 'receita', 'pergunta', 'desconhecido'].includes(p.intent as string)
    ? (p.intent as ClassifiedMessage['intent'])
    : 'desconhecido';

  return {
    intent,
    valor: typeof p.valor === 'number' ? p.valor : null,
    descricao: typeof p.descricao === 'string' ? p.descricao : '',
    categoria: typeof p.categoria === 'string' ? p.categoria : null,
    data: typeof p.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : today,
    aviso: typeof p.aviso === 'string' ? p.aviso : null,
  };
}

export async function answerFinancialQuestion(
  question: string,
  dataContext: string,
  today: string,
): Promise<string> {
  const system = [
    'Você é um assistente financeiro pessoal. Responda em português brasileiro, de forma direta e curta (2-4 frases).',
    `A data de hoje é ${today}.`,
    'Use APENAS os dados abaixo para responder — não invente valores. Se não puder responder, diga claramente.',
    'Formate valores em reais como R$ 1.234,56.',
    '--- DADOS DISPONÍVEIS ---',
    dataContext,
  ].join('\n');

  return ask(system, question);
}
