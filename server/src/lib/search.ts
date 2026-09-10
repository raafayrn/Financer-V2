/**
 * ============================================================
 * BUSCA UNIFICADA — parsing e ranking
 * ============================================================
 *
 * Funções PURAS, sem acesso a banco, para o ranking poder ser testado sem
 * subir servidor. A rota (routes/search.ts) só busca as linhas e chama daqui.
 *
 * ------------------------------------------------------------
 * Decisões, e o porquê de cada uma
 * ------------------------------------------------------------
 *
 * 1. LIKE, não FTS5.
 *    Medido no banco real (server/prisma/dev.db): 92 registros somados —
 *    62 despesas, 10 investimentos, 6 matérias, 5 fixas, 4 receitas, 4 provas,
 *    1 evento. Mesmo projetando dez anos de uso pesado a coisa não passa de
 *    alguns milhares de linhas, onde um LIKE varre em menos de um milissegundo.
 *    FTS5 custaria tabela sombra, gatilhos para manter sincronia e migração —
 *    complexidade permanente por ganho que não dá para medir. Se um dia o
 *    volume mudar de ordem de grandeza, a troca fica contida na rota.
 *
 * 2. Ranking entre tipos diferentes: o que ainda dá para AGIR vence o que já
 *    aconteceu.
 *    O caso do enunciado — um gasto de R$ 3.000 de hoje contra uma prova daqui
 *    a 2 dias — resolve pela prova. O gasto é um REGISTRO: já saiu da conta,
 *    achar não muda nada. A prova é um COMPROMISSO com prazo, e quem digita
 *    numa caixa de busca está quase sempre indo fazer algo.
 *
 *    Note que não dá para decidir isso só pela data: um gasto de hoje e uma
 *    prova de hoje têm a mesma data e urgências opostas. Por isso o peso do
 *    tempo depende da NATUREZA do registro, não do sinal da diferença de dias.
 *    Compromisso ganha bônus que decai com a distância (e atrasado continua no
 *    topo, porque atraso é mais urgente ainda); registro decai com a idade.
 *
 * 3. Valor entra na busca, data em linguagem natural não.
 *    "3000", "R$ 3.000,00" e "3.000,00" viram 300000 centavos e casam com o
 *    valor exato — é barato e não tem ambiguidade. Já "ontem" ou "março" ficam
 *    de fora: numa caixa de uma linha elas competem com descrições que contêm
 *    essas palavras ("conta de março"), e o app já tem navegador de mês, que
 *    resolve o mesmo problema sem adivinhação.
 *
 * 4. Limites: 5 por tipo, 20 no total.
 *    A lista é para navegar com o teclado. Passando disso ninguém lê — refina
 *    a busca.
 */

export const LIMITE_POR_TIPO = 5;
export const LIMITE_TOTAL = 20;

export type SearchKind =
  | 'expense'
  | 'income'
  | 'recurring'
  | 'investment'
  | 'subject'
  | 'exam'
  | 'task'
  | 'event';

export interface SearchHit {
  id: string;
  kind: SearchKind;
  /** Texto principal — é o que casa com a busca. */
  title: string;
  /** Linha de apoio: categoria, matéria, conta. */
  subtitle?: string;
  /** Em reais, quando o registro tem valor. */
  amount?: number;
  /** AAAA-MM-DD, quando o registro tem data. */
  date?: string;
  /** Para onde o client navega ao escolher. */
  href: string;
  score: number;
}

/**
 * Normaliza para comparar: minúsculas e sem acento. "Energético" tem que casar
 * com "energetico" — ninguém digita acento em caixa de busca.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Extrai um valor em CENTAVOS da busca, quando ela é um número.
 * Aceita "3000", "R$ 3.000,00", "3.000,00", "3000.50".
 * Devolve null quando a busca não é (só) um número.
 */
export function valorEmCentavos(query: string): number | null {
  const limpo = query.replace(/r\$/gi, '').trim();
  if (!/^[\d.,\s]+$/.test(limpo) || !/\d/.test(limpo)) return null;

  const semEspaco = limpo.replace(/\s/g, '');
  // Formato brasileiro: o último separador com 2 dígitos depois é o decimal.
  const m = semEspaco.match(/^(.*)[.,](\d{2})$/);
  if (m) {
    const inteiros = m[1].replace(/[.,]/g, '');
    if (inteiros === '') return null;
    return Number(inteiros) * 100 + Number(m[2]);
  }
  const inteiros = semEspaco.replace(/[.,]/g, '');
  if (inteiros === '') return null;
  return Number(inteiros) * 100;
}

/**
 * Qualidade do casamento entre a busca e o texto do registro (0 a 1).
 * Começar com o termo vale mais que contê-lo no meio: quem digita "net" quer
 * "Netflix" antes de "Internet".
 */
export function relevanciaDoTexto(query: string, texto: string): number {
  const q = normalizar(query);
  const t = normalizar(texto);
  if (!q) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.85;
  // Começo de qualquer palavra: "cred" casa bem com "Cartão de crédito".
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 0.7;
  if (t.includes(q)) return 0.5;
  return 0;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O que a data significa para aquele registro.
 *
 * `compromisso` — prova, tarefa com prazo, evento: a data é um PRAZO.
 * `registro`    — gasto, receita, aporte: a data é QUANDO ACONTECEU.
 */
export type Natureza = 'compromisso' | 'registro';

/**
 * Peso do tempo, e é aqui que tipos diferentes se comparam.
 *
 * COMPROMISSO: 1.6 para hoje ou amanhã, caindo até 1.0 em ~30 dias. Atrasado
 * fica no teto — passar do prazo é mais urgente, não menos.
 * REGISTRO: 1.0 hoje, ~0.85 depois de um mês, ~0.6 depois de um ano, piso em
 * 0.5. Registro com data futura (parcela agendada) é neutro: não é obrigação.
 * SEM DATA (matéria, fixa): neutro, 1.0. Não têm quando.
 */
export function pesoDoTempo(
  dataIso: string | null | undefined,
  hojeIso: string,
  natureza: Natureza = 'registro',
): number {
  if (!dataIso) return 1;
  const dias = Math.round((Date.parse(dataIso) - Date.parse(hojeIso)) / DIA_MS);

  if (natureza === 'compromisso') {
    if (dias < 0) return 1.6; // atrasado
    return Math.max(1, 1.6 - (dias / 30) * 0.6);
  }

  if (dias > 0) return 1; // registro lançado no futuro: nada a fazer com ele
  return Math.max(0.5, 1 - Math.abs(dias) / 900);
}

/** Nota final de um resultado. Ordena a lista inteira, entre tipos. */
export function pontuar(
  relevancia: number,
  dataIso: string | null | undefined,
  hojeIso: string,
  natureza: Natureza = 'registro',
): number {
  return relevancia * pesoDoTempo(dataIso, hojeIso, natureza);
}

/** Ordena e aplica os limites: 5 por tipo, 20 no total. */
export function ordenarELimitar(hits: SearchHit[]): SearchHit[] {
  const porTipo = new Map<SearchKind, number>();
  return hits
    .slice()
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((h) => {
      const usados = porTipo.get(h.kind) ?? 0;
      if (usados >= LIMITE_POR_TIPO) return false;
      porTipo.set(h.kind, usados + 1);
      return true;
    })
    .slice(0, LIMITE_TOTAL);
}
