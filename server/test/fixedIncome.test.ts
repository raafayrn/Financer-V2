import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

let auth: { Authorization: string };

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Teste Renda',
    email: `renda-${Date.now()}@example.com`,
    password: 'senha-forte-123',
  });
  auth = { Authorization: `Bearer ${res.body.token}` };

  // Salário e VR definidos só em maio/2026.
  await request(app).put('/api/salary/2026/5').set(auth).send({ amount: 4500 });
  await request(app).put('/api/voucher/2026/5').set(auth).send({ amount: 800 });
});

describe('salário/VR se repetem sozinhos', () => {
  it('o mês definido devolve o próprio valor, sem herança', async () => {
    const res = await request(app).get('/api/salary/2026/5').set(auth);
    expect(res.body.amount).toBe(4500);
    expect(res.body.inherited).toBe(false);
  });

  // O ponto: não precisar redigitar todo mês.
  it('meses seguintes herdam o último valor definido', async () => {
    for (const mes of [6, 7, 8, 12]) {
      const res = await request(app).get(`/api/salary/2026/${mes}`).set(auth);
      expect(res.body.amount, `mês ${mes}`).toBe(4500);
      expect(res.body.inherited).toBe(true);
      expect(res.body.inheritedFrom).toEqual({ year: 2026, month: 5 });
    }
  });

  it('a herança atravessa a virada de ano', async () => {
    const res = await request(app).get('/api/salary/2027/3').set(auth);
    expect(res.body.amount).toBe(4500);
    expect(res.body.inherited).toBe(true);
  });

  it('o VR herda igual ao salário', async () => {
    const res = await request(app).get('/api/voucher/2026/9').set(auth);
    expect(res.body.amount).toBe(800);
    expect(res.body.inherited).toBe(true);
  });

  // Herança é só pra frente: antes do primeiro registro não havia salário.
  it('meses anteriores ao primeiro registro continuam zerados', async () => {
    const res = await request(app).get('/api/salary/2026/4').set(auth);
    expect(res.body.amount).toBe(0);
    expect(res.body.inherited).toBe(false);
  });

  it('um aumento vale do mês do aumento em diante, sem mexer no passado', async () => {
    await request(app).put('/api/salary/2026/8').set(auth).send({ amount: 5200 });

    // Antes do aumento: valor antigo.
    const julho = await request(app).get('/api/salary/2026/7').set(auth);
    expect(julho.body.amount).toBe(4500);

    // No mês do aumento e depois: valor novo.
    const agosto = await request(app).get('/api/salary/2026/8').set(auth);
    expect(agosto.body.amount).toBe(5200);
    expect(agosto.body.inherited).toBe(false);

    const outubro = await request(app).get('/api/salary/2026/10').set(auth);
    expect(outubro.body.amount).toBe(5200);
    expect(outubro.body.inheritedFrom).toEqual({ year: 2026, month: 8 });
  });

  it('o resumo do mês usa a renda herdada', async () => {
    const res = await request(app).get('/api/summary?year=2026&month=11').set(auth);
    expect(res.body.income.salary).toBe(5200);
    expect(res.body.income.voucher).toBe(800);
    expect(res.body.income.salaryInherited).toBe(true);
  });
});

describe('POST /api/recurring/materialize (puxar fixas para outro mês)', () => {
  let mAuth: { Authorization: string };

  beforeAll(async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Teste Puxar',
      email: `puxar-${Date.now()}@example.com`,
      password: 'senha-forte-123',
    });
    mAuth = { Authorization: `Bearer ${reg.body.token}` };

    await request(app)
      .post('/api/recurring')
      .set(mAuth)
      .send({ description: 'Aluguel', amount: 1200, dayOfMonth: 10, startYear: 2026, startMonth: 1 });
    await request(app)
      .post('/api/recurring')
      .set(mAuth)
      .send({ description: 'Internet', amount: 110, dayOfMonth: 8, startYear: 2026, startMonth: 1 });
  });

  it('lança as fixas num mês futuro sob demanda', async () => {
    const antes = await request(app).get('/api/expenses?year=2027&month=6').set(mAuth);
    expect(antes.body).toHaveLength(0);

    const res = await request(app).post('/api/recurring/materialize?year=2027&month=6').set(mAuth);
    expect(res.status).toBe(200);
    expect(res.body.createdCount).toBe(2);
    expect(res.body.recurringTotal).toBe(1310);

    const depois = await request(app).get('/api/expenses?year=2027&month=6').set(mAuth);
    expect(depois.body).toHaveLength(2);
    // Todas no dia 1, como qualquer fixa.
    expect(depois.body.every((e: { date: string }) => e.date === '2027-06-01')).toBe(true);
  });

  it('rodar de novo não duplica', async () => {
    const res = await request(app).post('/api/recurring/materialize?year=2027&month=6').set(mAuth);
    expect(res.body.createdCount).toBe(0);
    expect(res.body.recurringTotal).toBe(1310);

    const depois = await request(app).get('/api/expenses?year=2027&month=6').set(mAuth);
    expect(depois.body).toHaveLength(2);
  });

  it('rejeita mês inválido', async () => {
    const res = await request(app).post('/api/recurring/materialize?year=2027&month=13').set(mAuth);
    expect(res.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const res = await request(app).post('/api/recurring/materialize');
    expect(res.status).toBe(401);
  });
});
