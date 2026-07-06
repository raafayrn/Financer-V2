/**
 * Parsers para extratos/faturas em aberto exportados pelo banco (OFX/CSV).
 * Diferente do PDF (texto livre), o OFX segue um formato quase-XML bem
 * definido — dá pra extrair as transações sem depender de IA.
 */

export interface RawTransaction {
  date: string; // AAAA-MM-DD
  description: string;
  amount: number; // reais, sempre positivo (já filtrado como despesa)
}

/**
 * Decodifica um Buffer tentando UTF-8 primeiro; extratos de banco no Brasil
 * às vezes vêm em ISO-8859-1 (Latin-1), então cai para esse encoding se o
 * UTF-8 estrito falhar.
 */
export function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buf);
  }
}

/**
 * Extrai despesas de um arquivo OFX (fatura de cartão em aberto).
 * Cada bloco <STMTTRN> vira uma transação; usamos TRNTYPE para separar
 * compras (DEBIT) de pagamentos/estornos (CREDIT, que não são despesas).
 * Quando TRNTYPE não vem preenchido, assume-se que valor positivo = compra
 * (convenção comum em OFX de fatura de cartão).
 */
export function parseOfxExpenses(ofxText: string): RawTransaction[] {
  const results: RawTransaction[] = [];
  const blocks = ofxText.split(/<STMTTRN>/i).slice(1);

  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];

    const get = (tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, 'i'));
      return m ? m[1].trim() : null;
    };

    const trnType = (get('TRNTYPE') ?? '').toUpperCase();
    const dtPosted = get('DTPOSTED');
    const trnAmtRaw = get('TRNAMT');
    const name = get('NAME') ?? get('MEMO') ?? get('PAYEE') ?? '';

    if (!dtPosted || !trnAmtRaw) continue;

    const amount = Number(trnAmtRaw);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const isExpense = trnType === 'DEBIT' || (!trnType && amount > 0);
    if (!isExpense) continue;

    const y = dtPosted.slice(0, 4);
    const m = dtPosted.slice(4, 6);
    const d = dtPosted.slice(6, 8);
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) continue;

    results.push({
      date: `${y}-${m}-${d}`,
      description: name || 'Transação',
      amount: Math.abs(amount),
    });
  }

  return results;
}
