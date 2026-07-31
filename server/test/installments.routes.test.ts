import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

let auth: { Authorization: string };

/** (ano, mês) somando `n` meses a (2026, 7). */
function shift(n: number): { year: number; month: number } {
  const total = 6 + n; // julho = índice 6
  return { year: 2026 + Math.floor(total / 12), month: (total % 12) + 1 };
}

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Teste Parcelas',
    email: `parcelas-${Date.now()}@example.com`,
    password: 'senha-forte-123',
  });
  auth = { Authorization: `Bearer ${res.body.token}` };
});

describe('POST /api/expenses com parcelas', () => {
  it('cria uma despesa por mês, a partir do mês da compra', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ description: 'Notebook', amount: 3000, date: '2026-07-20', installments: 6 });

    expect(res.status).toBe(201);
    expect(res.body.installmentPlan).toHaveLength(6);
    expect(res.body.description).toBe('Notebook (1/6)');
    expect(res.body.amount).toBe(500);
    expect(res.body.installmentNo).toBe(1);
    expect(res.body.installmentTotal).toBe(6);

    const datas = res.body.installmentPlan.map((p: { date: string }) => p.date);
    expect(datas).toEqual([
      '2026-07-20', '2026-08-20', '2026-09-20',
      '2026-10-20', '2026-11-20', '2026-12-20',
    ]);
  });

  it('cada parcela cai no seu próprio mês', async () => {
    for (let i = 0; i < 6; i++) {
      const { year, month } = shift(i);
      const res = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
      const parcela = res.body.find((e: { description: string }) =>
        e.description.startsWith('Notebook'),
      );
      expect(parcela, `mês ${month}/${year}`).toBeDefined();
      expect(parcela.description).toBe(`Notebook (${i + 1}/6)`);
      expect(parcela.amount).toBe(500);
    }
  });

  // Nenhum centavo pode sumir na divisão.
  it('a soma das parcelas bate com o valor da compra', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ description: 'Celular', amount: 2599.99, date: '2026-07-05', installments: 7 });

    const soma = res.body.installmentPlan.reduce(
      (s: number, p: { amount: number }) => s + p.amount,
      0,
    );
    expect(Number(soma.toFixed(2))).toBe(2599.99);
  });

  it('installments = 1 cria uma despesa comum, sem grupo', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ description: 'Café', amount: 12, date: '2026-07-10', installments: 1 });

    expect(res.body.installmentGroupId).toBeNull();
    expect(res.body.description).toBe('Café');
    expect(res.body.installmentPlan).toBeUndefined();
  });

  it('rejeita número de parcelas inválido', async () => {
    for (const installments of [0, -3, 61, 2.5]) {
      const res = await request(app)
        .post('/api/expenses')
        .set(auth)
        .send({ description: 'X', amount: 100, date: '2026-07-10', installments });
      expect(res.status, `installments=${installments}`).toBe(400);
    }
  });
});

describe('DELETE de compra parcelada', () => {
  it('sem ?group=1 apaga só a parcela do mês', async () => {
    const criada = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ description: 'Fone', amount: 600, date: '2026-07-12', installments: 3 });

    await request(app).delete(`/api/expenses/${criada.body.id}`).set(auth);

    const julho = await request(app).get('/api/expenses?year=2026&month=7').set(auth);
    expect(julho.body.filter((e: { description: string }) => e.description.startsWith('Fone'))).toHaveLength(0);

    // As parcelas seguintes continuam lá.
    const agosto = await request(app).get('/api/expenses?year=2026&month=8').set(auth);
    expect(agosto.body.filter((e: { description: string }) => e.description.startsWith('Fone'))).toHaveLength(1);
  });

  it('com ?group=1 apaga o parcelamento inteiro', async () => {
    const criada = await request(app)
      .post('/api/expenses')
      .set(auth)
      .send({ description: 'Geladeira', amount: 2400, date: '2026-07-15', installments: 4 });

    const res = await request(app)
      .delete(`/api/expenses/${criada.body.id}?group=1`)
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(4);

    for (let i = 0; i < 4; i++) {
      const { year, month } = shift(i);
      const mes = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
      expect(
        mes.body.filter((e: { description: string }) => e.description.startsWith('Geladeira')),
      ).toHaveLength(0);
    }
  });
});
