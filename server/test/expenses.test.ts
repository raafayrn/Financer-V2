import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const user = {
  name: 'Teste Expenses',
  email: `expenses-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let token: string;
let walletAccountId: string;

beforeAll(async () => {
  const registerRes = await request(app).post('/api/auth/register').send(user);
  token = registerRes.body.token;

  const accountsRes = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
  walletAccountId = accountsRes.body.find((a: { kind: string }) => a.kind === 'WALLET').id;
});

describe('GET /api/accounts', () => {
  it('cria e lista as 3 contas fixas do usuário', async () => {
    const res = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((a: { kind: string }) => a.kind).sort()).toEqual([
      'CREDIT_CARD',
      'FOOD_VOUCHER',
      'WALLET',
    ]);
  });
});

describe('POST /api/expenses', () => {
  it('cria uma despesa vinculada a uma conta do usuário', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Mercado',
        amount: 150.5,
        date: '2026-07-08',
        accountId: walletAccountId,
        recurring: false,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: 'Mercado', amount: 150.5 });
  });

  it('rejeita conta que não pertence ao usuário', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Suspeita',
        amount: 10,
        date: '2026-07-08',
        accountId: 'conta-de-outro-usuario',
        recurring: false,
      });
    expect(res.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ description: 'Sem token', amount: 10, date: '2026-07-08' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/expenses', () => {
  it('lista apenas as despesas do mês informado', async () => {
    const res = await request(app)
      .get('/api/expenses')
      .query({ year: 2026, month: 7 })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toMatchObject({ description: 'Mercado' });
  });

  it('não vaza despesas de outro mês', async () => {
    const res = await request(app)
      .get('/api/expenses')
      .query({ year: 2020, month: 1 })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('DELETE /api/expenses/:id', () => {
  it('remove uma despesa do próprio usuário', async () => {
    const createRes = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Para deletar', amount: 5, date: '2026-07-08' });

    const del = await request(app)
      .delete(`/api/expenses/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it('devolve 404 para despesa inexistente', async () => {
    const res = await request(app)
      .delete('/api/expenses/id-que-nao-existe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
