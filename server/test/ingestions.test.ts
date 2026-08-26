import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';

const app = createApp();

let token: string;
let userId: string;
let categoryId: string;
let cardAccountId: string;
let walletAccountId: string;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Teste Pendentes',
      email: `ingestions-test-${Date.now()}@example.com`,
      password: 'senha-forte-123',
    });
  token = res.body.token;
  userId = res.body.user.id;

  const cat = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Casa' });
  categoryId = cat.body.id;

  const accounts = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
  cardAccountId = accounts.body.find((a: { kind: string }) => a.kind === 'CREDIT_CARD').id;
  walletAccountId = accounts.body.find((a: { kind: string }) => a.kind === 'WALLET').id;
});

async function pending(overrides: Record<string, unknown> = {}) {
  return prisma.expenseIngestion.create({
    data: {
      userId,
      amount: 15000,
      merchant: 'LEROY MERLIN',
      occurredAt: new Date('2026-09-10T18:06:00-03:00'),
      source: 'wallet_shortcut',
      status: 'pending',
      transactionType: 'credit_purchase',
      parseConfidence: 'high',
      rawPayload: '{}',
      ...overrides,
    },
  });
}

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/ingestions', () => {
  it('lista só os pendentes por padrão', async () => {
    const p = await pending();
    await pending({ status: 'discarded', merchant: 'descartado' });

    const res = await request(app).get('/api/ingestions').set(auth());
    expect(res.status).toBe(200);
    const ids = res.body.ingestions.map((i: { id: string }) => i.id);
    expect(ids).toContain(p.id);
    expect(res.body.ingestions.every((i: { status: string }) => i.status === 'pending')).toBe(true);
  });

  it('devolve o valor em reais e o mergedFrom já como lista', async () => {
    const p = await pending({ amount: 3290, mergedFrom: '["abc"]' });
    const res = await request(app).get('/api/ingestions').set(auth());
    const row = res.body.ingestions.find((i: { id: string }) => i.id === p.id);
    expect(row.amount).toBe(32.9);
    expect(row.mergedFrom).toEqual(['abc']);
  });

  it('conta os pendentes para o menu', async () => {
    const res = await request(app).get('/api/ingestions/count').set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.pending).toBe('number');
  });

  it('exige autenticação', async () => {
    const res = await request(app).get('/api/ingestions');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ingestions/:id/confirm', () => {
  it('vira Expense no cartão e some da fila', async () => {
    const p = await pending();

    const res = await request(app).post(`/api/ingestions/${p.id}/confirm`).set(auth()).send({});
    expect(res.status).toBe(200);
    expect(res.body.expenseId).toBeTruthy();
    expect(res.body.ingestion.status).toBe('confirmed');

    const expense = await prisma.expense.findUnique({ where: { id: res.body.expenseId } });
    expect(expense?.amount).toBe(15000);
    expect(expense?.description).toBe('LEROY MERLIN');
    // Compra no crédito cai no cartão sem ninguém precisar dizer.
    expect(expense?.accountId).toBe(cardAccountId);
    // A data sai da hora da COMPRA, não da chegada do aviso.
    expect(expense?.date.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('aceita correções feitas na tela', async () => {
    const p = await pending({ amount: 15000, merchant: 'material' });

    const res = await request(app)
      .post(`/api/ingestions/${p.id}/confirm`)
      .set(auth())
      .send({ amount: 149.9, description: 'Tinta', categoryId, date: '2026-09-11' });

    const expense = await prisma.expense.findUnique({ where: { id: res.body.expenseId } });
    expect(expense?.amount).toBe(14990);
    expect(expense?.description).toBe('Tinta');
    expect(expense?.categoryId).toBe(categoryId);
    expect(expense?.date.toISOString().slice(0, 10)).toBe('2026-09-11');
  });

  it('Pix recebido vira Income na carteira, não despesa', async () => {
    const p = await pending({
      transactionType: 'pix_in',
      merchant: 'PIX DE FULANO',
      source: 'email',
    });

    const res = await request(app).post(`/api/ingestions/${p.id}/confirm`).set(auth()).send({});
    expect(res.body.incomeId).toBeTruthy();
    expect(res.body.expenseId).toBeNull();

    const income = await prisma.income.findUnique({ where: { id: res.body.incomeId } });
    expect(income?.accountId).toBe(walletAccountId);
    expect(income?.amount).toBe(15000);
  });

  it('recusa confirmar sem valor — nada entra no mês por adivinhação', async () => {
    const p = await pending({ amount: null });
    const res = await request(app).post(`/api/ingestions/${p.id}/confirm`).set(auth()).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valor/i);

    const row = await prisma.expenseIngestion.findUnique({ where: { id: p.id } });
    expect(row?.status).toBe('pending');
  });

  it('não confirma duas vezes', async () => {
    const p = await pending();
    await request(app).post(`/api/ingestions/${p.id}/confirm`).set(auth()).send({});
    const segunda = await request(app).post(`/api/ingestions/${p.id}/confirm`).set(auth()).send({});
    expect(segunda.status).toBe(409);

    const expenses = await prisma.expense.count({ where: { userId, description: 'LEROY MERLIN' } });
    expect(expenses).toBeGreaterThan(0);
  });

  it('recusa categoria de outro usuário', async () => {
    const p = await pending();
    const res = await request(app)
      .post(`/api/ingestions/${p.id}/confirm`)
      .set(auth())
      .send({ categoryId: 'categoria-inexistente' });
    expect(res.status).toBe(400);
  });

  it('não confirma pendente de outro usuário', async () => {
    const outro = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Outro',
        email: `ingestions-outro-${Date.now()}@example.com`,
        password: 'senha-forte-123',
      });
    const p = await pending();
    const res = await request(app)
      .post(`/api/ingestions/${p.id}/confirm`)
      .set('Authorization', `Bearer ${outro.body.token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/ingestions/:id/discard', () => {
  it('descarta sem criar lançamento', async () => {
    const p = await pending({ merchant: 'compra que nao foi minha' });
    const antes = await prisma.expense.count({ where: { userId } });

    const res = await request(app).post(`/api/ingestions/${p.id}/discard`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.ingestion.status).toBe('discarded');

    const depois = await prisma.expense.count({ where: { userId } });
    expect(depois).toBe(antes);
  });
});

describe('POST /api/ingestions/:id/unmerge', () => {
  it('devolve para a fila o registro que tinha sido absorvido', async () => {
    const absorvido = await pending({ status: 'discarded', merchant: 'segundo café' });
    const vencedor = await pending({
      merchant: 'primeiro café',
      source: 'email+shortcut',
      mergedFrom: JSON.stringify([absorvido.id]),
    });

    const res = await request(app).post(`/api/ingestions/${vencedor.id}/unmerge`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.restored).toBe(1);
    expect(res.body.ingestion.mergedFrom).toEqual([]);

    const voltou = await prisma.expenseIngestion.findUnique({ where: { id: absorvido.id } });
    expect(voltou?.status).toBe('pending');
  });

  it('recusa desfazer fusão em quem não absorveu nada', async () => {
    const p = await pending();
    const res = await request(app).post(`/api/ingestions/${p.id}/unmerge`).set(auth());
    expect(res.status).toBe(400);
  });
});
