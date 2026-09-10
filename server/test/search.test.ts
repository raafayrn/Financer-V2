import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  normalizar,
  ordenarELimitar,
  pesoDoTempo,
  pontuar,
  relevanciaDoTexto,
  valorEmCentavos,
  type SearchHit,
} from '../src/lib/search';

const app = createApp();

/**
 * A busca tem duas metades: o ranking (puro, em lib/search.ts) e a rota que
 * junta sete tipos numa lista só. As duas são testadas aqui — o ranking com
 * casos diretos, e a rota com dados plantados de propósito para o critério
 * "o que ainda dá para agir vem antes do que já aconteceu" ficar visível.
 */

describe('valorEmCentavos', () => {
  it('aceita os formatos que alguém digita de verdade', () => {
    expect(valorEmCentavos('3000')).toBe(300000);
    expect(valorEmCentavos('R$ 3.000,00')).toBe(300000);
    expect(valorEmCentavos('3.000,00')).toBe(300000);
    expect(valorEmCentavos('3000,50')).toBe(300050);
    expect(valorEmCentavos('  120 ')).toBe(12000);
  });

  it('devolve null quando a busca não é um número', () => {
    expect(valorEmCentavos('mercado')).toBeNull();
    expect(valorEmCentavos('conta 300')).toBeNull();
    expect(valorEmCentavos('')).toBeNull();
    expect(valorEmCentavos('R$')).toBeNull();
  });
});

describe('relevanciaDoTexto', () => {
  it('ignora acento e caixa', () => {
    expect(normalizar('Energético')).toBe('energetico');
    expect(relevanciaDoTexto('energetico', 'Energético')).toBe(1);
  });

  it('prefere quem COMEÇA com o termo a quem só o contém', () => {
    const netflix = relevanciaDoTexto('net', 'Netflix');
    const internet = relevanciaDoTexto('net', 'Internet');
    expect(netflix).toBeGreaterThan(internet);
  });

  it('casa no começo de qualquer palavra', () => {
    expect(relevanciaDoTexto('cred', 'Cartão de crédito')).toBeGreaterThan(0.5);
  });

  it('devolve 0 quando não casa', () => {
    expect(relevanciaDoTexto('xyz', 'Mercado')).toBe(0);
  });
});

describe('pesoDoTempo', () => {
  const hoje = '2026-09-10';

  it('dá bônus ao compromisso próximo, maior quanto mais perto', () => {
    const amanha = pesoDoTempo('2026-09-11', hoje, 'compromisso');
    const emDuasSemanas = pesoDoTempo('2026-09-24', hoje, 'compromisso');
    expect(amanha).toBeGreaterThan(emDuasSemanas);
    expect(emDuasSemanas).toBeGreaterThan(1);
  });

  it('mantém compromisso atrasado no topo — atraso é mais urgente, não menos', () => {
    expect(pesoDoTempo('2026-09-01', hoje, 'compromisso')).toBe(1.6);
  });

  it('não dá bônus a compromisso distante, mas nunca o penaliza', () => {
    expect(pesoDoTempo('2027-09-10', hoje, 'compromisso')).toBe(1);
  });

  it('desconta o registro com a idade, com piso', () => {
    const mesPassado = pesoDoTempo('2026-08-10', hoje, 'registro');
    const anoPassado = pesoDoTempo('2025-09-10', hoje, 'registro');
    expect(mesPassado).toBeLessThan(1);
    expect(anoPassado).toBeLessThan(mesPassado);
    expect(anoPassado).toBeGreaterThanOrEqual(0.5);
  });

  it('trata registro lançado no futuro (parcela) como neutro', () => {
    expect(pesoDoTempo('2026-12-10', hoje, 'registro')).toBe(1);
  });

  it('trata registro sem data como neutro', () => {
    expect(pesoDoTempo(null, hoje)).toBe(1);
  });
});

describe('pontuar — o desempate entre tipos', () => {
  const hoje = '2026-09-10';

  it('põe a prova de daqui a 2 dias na frente do gasto de hoje', () => {
    // Mesmo texto casando igual nos dois: o que decide é a natureza da data.
    const prova = pontuar(1, '2026-09-12', hoje, 'compromisso');
    const gasto = pontuar(1, hoje, hoje, 'registro');
    expect(prova).toBeGreaterThan(gasto);
  });

  it('mesma data, urgências opostas: a prova de hoje vence o gasto de hoje', () => {
    // O caso que prova por que o peso não pode sair só do sinal da diferença.
    expect(pontuar(1, hoje, hoje, 'compromisso')).toBeGreaterThan(
      pontuar(1, hoje, hoje, 'registro'),
    );
  });
});

describe('ordenarELimitar', () => {
  function hit(kind: SearchHit['kind'], title: string, score: number): SearchHit {
    return { id: title, kind, title, href: '/', score };
  }

  it('ordena por nota e corta em 5 por tipo', () => {
    const muitasDespesas = Array.from({ length: 8 }, (_, i) => hit('expense', `Gasto ${i}`, 1 - i / 100));
    const saida = ordenarELimitar([...muitasDespesas, hit('exam', 'Prova', 0.4)]);

    expect(saida.filter((h) => h.kind === 'expense')).toHaveLength(5);
    expect(saida.filter((h) => h.kind === 'exam')).toHaveLength(1);
    expect(saida[0].title).toBe('Gasto 0');
  });

  it('corta a lista inteira em 20', () => {
    const tipos: SearchHit['kind'][] = ['expense', 'income', 'recurring', 'investment', 'subject', 'exam'];
    const todos = tipos.flatMap((k) =>
      Array.from({ length: 5 }, (_, i) => hit(k, `${k} ${i}`, 0.5)),
    );
    expect(todos.length).toBe(30);
    expect(ordenarELimitar(todos)).toHaveLength(20);
  });
});

// ============================================================
// A rota
// ============================================================

const user = {
  name: 'Teste Search',
  email: `search-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let auth: { Authorization: string };

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send(user);
  auth = { Authorization: `Bearer ${res.body.token}` };

  const contas = await request(app).get('/api/accounts').set(auth);
  const cartao = contas.body.find((a: { kind: string }) => a.kind === 'CREDIT_CARD').id;

  await request(app)
    .post('/api/expenses')
    .set(auth)
    .send({ description: 'Netflix', amount: 55, date: '2021-03-05', accountId: cartao });
  await request(app)
    .post('/api/expenses')
    .set(auth)
    .send({ description: 'Internet fibra', amount: 110, date: '2021-03-08', accountId: cartao });
  await request(app)
    .post('/api/expenses')
    .set(auth)
    .send({ description: 'Notebook', amount: 3000, date: '2021-03-10', accountId: cartao });
  await request(app)
    .post('/api/income')
    .set(auth)
    .send({ description: 'Freela de design', amount: 700, date: '2021-03-12' });
  await request(app)
    .post('/api/recurring')
    .set(auth)
    .send({ description: 'Academia mensal', amount: 130, dayOfMonth: 5 });
  await request(app)
    .post('/api/studies/subjects')
    .set(auth)
    .send({ name: 'Cálculo Diferencial' });
});

describe('GET /api/search', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/api/search').query({ q: 'netflix' });
    expect(res.status).toBe(401);
  });

  it('não busca com menos de 2 letras', async () => {
    const res = await request(app).get('/api/search').query({ q: 'n' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('acha um gasto pela descrição, com categoria, valor e destino', async () => {
    const res = await request(app).get('/api/search').query({ q: 'netflix' }).set(auth);
    expect(res.status).toBe(200);
    const hit = res.body.results.find((r: { kind: string }) => r.kind === 'expense');
    expect(hit).toMatchObject({
      kind: 'expense',
      title: 'Netflix',
      amount: 55,
      date: '2021-03-05',
    });
    expect(hit.href).toContain('/financas/lancamentos');
  });

  it('põe quem começa com o termo antes de quem só o contém', async () => {
    const res = await request(app).get('/api/search').query({ q: 'net' }).set(auth);
    const titulos = res.body.results.map((r: { title: string }) => r.title);
    expect(titulos.indexOf('Netflix')).toBeLessThan(titulos.indexOf('Internet fibra'));
  });

  it('busca por valor: "3000" acha o gasto de R$ 3.000', async () => {
    const res = await request(app).get('/api/search').query({ q: '3000' }).set(auth);
    const titulos = res.body.results.map((r: { title: string }) => r.title);
    expect(titulos).toContain('Notebook');
  });

  it('busca por valor no formato brasileiro completo', async () => {
    const res = await request(app).get('/api/search').query({ q: 'R$ 3.000,00' }).set(auth);
    const titulos = res.body.results.map((r: { title: string }) => r.title);
    expect(titulos).toContain('Notebook');
  });

  it('atravessa os tipos numa lista só', async () => {
    const res = await request(app).get('/api/search').query({ q: 'a' + 'l' }).set(auth);
    expect(res.status).toBe(200);
    const kinds = new Set(res.body.results.map((r: { kind: string }) => r.kind));
    // "al" casa com "Cálculo Diferencial" (matéria) e "Academia mensal" (fixa).
    expect(kinds.has('subject')).toBe(true);
    expect(kinds.has('recurring')).toBe(true);
  });

  it('acha receita e a marca como tal', async () => {
    const res = await request(app).get('/api/search').query({ q: 'freela' }).set(auth);
    expect(res.body.results[0]).toMatchObject({ kind: 'income', title: 'Freela de design' });
  });

  it('não vaza dados de outro usuário', async () => {
    const outro = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Outro', email: `search-outro-${Date.now()}@example.com`, password: 'senha-forte-123' });
    const res = await request(app)
      .get('/api/search')
      .query({ q: 'netflix' })
      .set({ Authorization: `Bearer ${outro.body.token}` });
    expect(res.body.results).toEqual([]);
  });
});
