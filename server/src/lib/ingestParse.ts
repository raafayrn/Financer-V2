import { env } from '../env';
import {
  parseIngestedEmail,
  parseIngestedShortcut,
  type ParsedIngestion,
} from '../services/claude';

/**
 * Interpretação do que chega pelos canais automáticos.
 *
 * Regra que atravessa o arquivo inteiro: NADA é descartado por não ter sido
 * entendido. Sem chave da Anthropic, com a API fora do ar ou com uma frase
 * que ninguém decifra, o registro entra assim mesmo — marcado com confiança
 * baixa, para a tela sinalizar. Um gasto que você vê e descarta custa um
 * clique; um gasto que sumiu em silêncio custa a confiança no app inteiro.
 */

/** Extrai o primeiro valor monetário de uma frase ("150 padaria" → 150). */
function extractAmount(text: string): number | null {
  // Aceita "R$ 150,90", "150.90", "150,9" e "150". A vírgula é decimal em
  // pt-BR; o ponto pode ser milhar ("1.500") ou decimal ("150.90"), então
  // desempata pela quantidade de casas depois dele.
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.](\d{1,2}))?/i);
  if (!match) return null;

  const inteiro = match[1].replace(/[.\s]/g, '');
  const centavos = match[2] ?? '0';
  const valor = Number(`${inteiro}.${centavos.padEnd(2, '0')}`);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Sobra da frase depois de tirar o valor — vira o nome do estabelecimento. */
function extractMerchant(text: string): string {
  const semValor = text
    .replace(/(?:r\$\s*)?\d{1,3}(?:[.\s]\d{3})+(?:[,.]\d{1,2})?/i, ' ')
    .replace(/(?:r\$\s*)?\d+(?:[,.]\d{1,2})?/i, ' ')
    .replace(/\b(reais?|conto|pila)\b/gi, ' ')
    .replace(/^\s*(no|na|em|de|do|da|pra|para|com)\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return semValor;
}

/**
 * Leitura sem IA da frase do atalho. Serve de fallback, mas não só: o formato
 * "<valor> <onde>" cobre a maioria esmagadora dos casos reais e não custa uma
 * chamada paga nem depende da rede na hora do pagamento.
 */
export function parseShortcutLocally(text: string): ParsedIngestion {
  const valor = extractAmount(text);
  const estabelecimento = extractMerchant(text);
  return {
    valor,
    estabelecimento: estabelecimento || text.trim(),
    categoria: null,
    occurredAt: null,
    transactionType: 'credit_purchase',
    // Nunca "high": sem a IA não houve leitura de categoria, e o nome é só o
    // que sobrou da frase. A tela deve pedir uma olhada.
    confianca: valor === null ? 'low' : 'medium',
  };
}

export interface IngestParseInput {
  source: 'wallet_shortcut' | 'email';
  text?: string;
  subject?: string;
  bodyText?: string;
  categories: string[];
}

export async function parseIngestion(input: IngestParseInput): Promise<ParsedIngestion> {
  if (input.source === 'wallet_shortcut') {
    const texto = input.text ?? '';
    if (!env.chatEnabled) return parseShortcutLocally(texto);
    try {
      const parsed = await parseIngestedShortcut(texto, input.categories);
      // A IA pode voltar sem valor mesmo com um número na frase; a leitura
      // local então assume, em vez de deixar o registro sem valor nenhum.
      if (parsed.valor === null) {
        const local = parseShortcutLocally(texto);
        if (local.valor !== null) return { ...parsed, ...local, categoria: parsed.categoria };
      }
      return parsed;
    } catch (err) {
      console.error('Parser de ingestão (atalho) falhou, usando leitura local:', err);
      return parseShortcutLocally(texto);
    }
  }

  // Canal e-mail: sem IA não há leitura possível (o corpo é HTML/texto longo
  // e variável). O registro entra cru, sinalizado, e você resolve na tela.
  const corpo = input.bodyText ?? '';
  const assunto = input.subject ?? '';
  if (!env.chatEnabled) {
    return {
      valor: null,
      estabelecimento: assunto || 'E-mail sem leitura automática',
      categoria: null,
      occurredAt: null,
      transactionType: 'unknown',
      confianca: 'low',
    };
  }
  try {
    return await parseIngestedEmail(corpo, assunto, input.categories);
  } catch (err) {
    console.error('Parser de ingestão (e-mail) falhou:', err);
    return {
      valor: null,
      estabelecimento: assunto || 'E-mail não interpretado',
      categoria: null,
      occurredAt: null,
      transactionType: 'unknown',
      confianca: 'low',
    };
  }
}
