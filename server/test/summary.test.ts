import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { currentYearMonth } from '../src/lib/month';

const app = createApp();

/**
 * GET /api/summary é a rota que alimenta o Dashboard inteiro. Ela não calcula
 * nada sozinha: combina lib/budget (puro, já coberto em budget.test.ts) com
 * renda herdada, saldo da carteira e materialização de fixas. O que se testa
 * aqui é a COMBINAÇÃO — em especial as duas regras que não são óbvias:
 *
 * 1. renda avulsa ligada à Carteira não entra em `income.extra` (entraria duas
 *    vezes no disponível, já que compõe `walletBalance`);
 * 2. gasto da Carteira não é subtraído de `remaining` (já foi descontado do
 *    próprio `walletBalance`).
 *
 * Os meses são fixos em 2021 para os cálculos não dependerem da data real em
 * que a suíte roda. Só o teste de fixas usa o mês corrente, porque a
 * materialização nunca age no futuro.
 */

const user = {
  name: 'Teste Summary',
  email: `summary-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let auth: { Authorization: string };
let creditCardId: string;
let foodVoucherId: string;
let walletId: string;
let casaCategoryId: string;

/** Mês base, com renda, orçamento, carteira, gastos nas 3 contas e 2 rendas. */
const Y = 2021;
const M = 3;

beforeAll(async () => {
  const registerRes = await request(app).post('/api/auth/register').send(user);
  auth = { Authorization: `Bearer ${registerRes.body.token}` };

  const accountsRes = await request(app).get('/api/accounts').set(auth);
  const byKind = (kind: string) =>
    accountsRes.body.find((a: { kind: string }) => a.kind === kind).id;
  creditCardId = byKind('CREDIT_CARD');
  foodVoucherId = byKind('FOOD_VOUCHER');
  walletId = byKind('WALLET');

  const categoryRes = await request(app)
    .post('/api/categories')
    .set(auth)
    .send({ name: 'Casa', color: '#6366f1' });
  casaCategoryId = categoryRes.body.id;

  // Renda fixa, orçamento e base da carteira do mês base.
  await request(app).put(`/api/salary/${Y}/${M}`).set(auth).send({ amount: 5000 });
  await request(app).put(`/api/voucher/${Y}/${M}`).set(auth).send({ amount: 800 });
  await request(app).put(`/api/wallet-base/${Y}/${M}`).set(auth).send({ amount: 300 });
  await request(app).put(`/api/budgets/${Y}/${M}`).set(auth).send({ amount: 4000 });

  // Gastos: um por bucket do breakdown.
  const expenses = [
    {
      description: 'Aluguel',
      amount: 1200,
      accountId: creditCardId,
      recurring: true,
      categoryId: casaCategoryId,
    },
    { description: 'Mercado', amount: 400.5, accountId: creditCardId, recurring: false },
    { description: 'Energetico', amount: 50, accountId: foodVoucherId, recurring: false },
    { description: 'Pix pro amigo', amount: 100, accountId: walletId, recurring: false },
  ];
  for (const e of expenses) {
    await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ ...e, date: `${Y}-0${M}-08` });
  }

  // Rendas avulsas: uma comum (entra em extra) e uma de Pix (não entra).
  await request(app)
    .post('/api/income')
    .set(auth)
    .send({ description: 'Freela', amount: 700, date: `${Y}-0${M}-10` });
  await request(app)
    .post('/api/income')
    .set(auth)
    .send({ description: 'Pix recebido', amount: 250, date: `${Y}-0${M}-10`, accountId: walletId });
});

describe('GET /api/summary — contrato de acesso', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/api/summary');
    expect(res.status).toBe(401);
  });

  it('rejeita year/month inválidos', async () => {
    const res = await request(app).get('/api/summary').query({ year: 2021, month: 13 }).set(auth);
    expect(res.status).toBe(400);
  });

  it('usa o mês corrente quando year/month não são informados', async () => {
    const res = await request(app).get('/api/summary').set(auth);
    const now = currentYearMonth();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ year: now.year, month: now.month });
  });
});

describe('GET /api/summary — mês com dados', () => {
  it('devolve renda, gasto por conta e orçamento do mês', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      year: Y,
      month: M,
      budget: 4000,
      totalSpent: 1750.5,
      expenseCount: 4,
      status: 'ok',
      walletBase: 300,
    });
    expect(res.body.accounts).toEqual({
      fixed: 1200,
      variable: 400.5,
      foodVoucher: 50,
      wallet: 100,
      total: 1750.5,
    });
  });

  it('separa a despesa recorrente (fixed) da avulsa no mesmo cartão', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    // Mesma conta (cartão), buckets diferentes: quem decide é a flag recurring.
    expect(res.body.accounts.fixed).toBe(1200);
    expect(res.body.accounts.variable).toBe(400.5);
  });

  it('não conta renda ligada à Carteira em income.extra', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    expect(res.body.income).toMatchObject({
      salary: 5000,
      voucher: 800,
      extra: 700, // só o Freela; o Pix de 250 fica fora
      total: 6500,
      salaryInherited: false,
      voucherInherited: false,
    });
  });

  it('calcula o saldo da carteira como base + Pix recebido − Pix gasto', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    expect(res.body.walletBalance).toBe(450); // 300 + 250 − 100
  });

  it('não desconta o gasto da carteira duas vezes em remaining', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    const { income, accounts, walletBalance, remaining } = res.body;

    const disponivel = income.total + walletBalance; // 6500 + 450
    const gastoForaDaCarteira = accounts.fixed + accounts.variable + accounts.foodVoucher;
    expect(remaining).toBeCloseTo(disponivel - gastoForaDaCarteira, 2);
    expect(remaining).toBe(5299.5);
    // Se o gasto de Pix fosse subtraído de novo, cairia para 5199.5.
    expect(remaining).not.toBe(5199.5);
  });

  it('calcula percentUsed sobre o disponível, não sobre o orçamento', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    expect(res.body.percentUsed).toBeCloseTo(1650.5 / 6950, 5);
  });

  it('devolve monthSurplus como renda total menos gasto total', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    expect(res.body.monthSurplus).toBe(4749.5); // 6500 − 1750.5
  });

  it('agrupa por categoria, do maior gasto para o menor, com "Sem categoria"', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(auth);
    expect(res.body.byCategory).toHaveLength(2);
    expect(res.body.byCategory[0]).toMatchObject({
      categoryId: casaCategoryId,
      categoryName: 'Casa',
      spent: 1200,
    });
    expect(res.body.byCategory[1]).toMatchObject({
      categoryId: null,
      categoryName: 'Sem categoria',
      spent: 550.5, // 400.5 + 50 + 100
    });
  });
});

describe('GET /api/summary — renda herdada', () => {
  it('herda salário e VR do último mês definido, marcando inherited', async () => {
    const res = await request(app)
      .get('/api/summary')
      .query({ year: Y, month: M + 1 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.income).toMatchObject({
      salary: 5000,
      voucher: 800,
      extra: 0, // renda avulsa é do mês, não se herda
      total: 5800,
      salaryInherited: true,
      voucherInherited: true,
    });
    // Base da carteira NÃO é herdada: cada mês tem a sua.
    expect(res.body.walletBase).toBe(0);
    expect(res.body.walletBalance).toBe(0);
    expect(res.body.remaining).toBe(5800);
  });

  it('não herda para trás: mês anterior ao primeiro salário fica zerado', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: 1 }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      budget: 0,
      totalSpent: 0,
      remaining: 0,
      percentUsed: 0,
      status: 'ok',
      expenseCount: 0,
      monthSurplus: 0,
      walletBalance: 0,
      walletBase: 0,
    });
    expect(res.body.byCategory).toEqual([]);
    expect(res.body.income).toMatchObject({ salary: 0, voucher: 0, extra: 0, total: 0 });
  });
});

describe('GET /api/summary — status do mês', () => {
  // Disponível = salário + VR herdados (5800). Sem carteira e sem renda avulsa.
  const statusMonth = 5;

  it('vira warning a partir de 80% do disponível', async () => {
    await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({
        description: 'Gasto alto',
        amount: 5400,
        date: `${Y}-0${statusMonth}-05`,
        accountId: creditCardId,
      });

    const res = await request(app)
      .get('/api/summary')
      .query({ year: Y, month: statusMonth })
      .set(auth);
    expect(res.body.status).toBe('warning');
    expect(res.body.remaining).toBe(400); // 5800 − 5400
  });

  it('vira over e remaining negativo quando passa de 100%', async () => {
    await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({
        description: 'Estouro',
        amount: 1700,
        date: `${Y}-0${statusMonth}-06`,
        accountId: creditCardId,
      });

    const res = await request(app)
      .get('/api/summary')
      .query({ year: Y, month: statusMonth })
      .set(auth);
    expect(res.body.status).toBe('over');
    expect(res.body.remaining).toBe(-1300); // 5800 − 7100
  });
});

describe('GET /api/summary — despesas fixas e isolamento', () => {
  const other = {
    name: 'Outro Summary',
    email: `summary-other-${Date.now()}@example.com`,
    password: 'senha-forte-123',
  };
  let otherAuth: { Authorization: string };

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send(other);
    otherAuth = { Authorization: `Bearer ${res.body.token}` };
  });

  it('não vaza dados de outro usuário', async () => {
    const res = await request(app).get('/api/summary').query({ year: Y, month: M }).set(otherAuth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalSpent: 0, expenseCount: 0, remaining: 0 });
    expect(res.body.income.total).toBe(0);
  });

  it('conta a fixa do mês corrente como gasto recorrente, sem duplicar a cada leitura', async () => {
    const now = currentYearMonth();
    await request(app)
      .post('/api/recurring')
      .set(otherAuth)
      .send({ description: 'Internet', amount: 120, dayOfMonth: 10 });

    // A materialização roda a cada GET /api/summary. Se não for idempotente, o
    // valor cresce a cada refresh do dashboard.
    let last;
    for (let i = 0; i < 3; i++) {
      last = await request(app)
        .get('/api/summary')
        .query({ year: now.year, month: now.month })
        .set(otherAuth);
    }
    expect(last!.status).toBe(200);
    expect(last!.body.accounts.fixed).toBe(120);
    expect(last!.body.totalSpent).toBe(120);
    expect(last!.body.expenseCount).toBe(1);
  });
});
