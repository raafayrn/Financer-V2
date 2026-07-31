import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { currentYearMonth } from '../src/lib/month';

const app = createApp();

const user = {
  name: 'Teste Recorrentes',
  email: `recurring-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let token: string;
let auth: { Authorization: string };
const { year, month } = currentYearMonth();

/** Mês anterior ao corrente, para testar que o passado não é reescrito. */
function prevMonth(): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send(user);
  token = res.body.token;
  auth = { Authorization: `Bearer ${token}` };
});

describe('POST /api/recurring', () => {
  it('cria o template e já gera a despesa do mês corrente', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Aluguel', amount: 1200, dayOfMonth: 10 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: 'Aluguel', amount: 1200, dayOfMonth: 10, active: true });

    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    const gerada = expenses.body.filter((e: { description: string }) => e.description === 'Aluguel');
    expect(gerada).toHaveLength(1);
    expect(gerada[0].recurring).toBe(true);
    expect(gerada[0].recurringExpenseId).toBe(res.body.id);
    expect(gerada[0].amount).toBe(1200);
    // Lançada no dia 1, não no vencimento (dia 10): a fatura do mês já nasce
    // inteira, que é o ponto do app.
    expect(gerada[0].date).toBe(`${year}-${String(month).padStart(2, '0')}-01`);
  });

  it('rejeita dia fora de 1-31', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Inválido', amount: 10, dayOfMonth: 32 });
    expect(res.status).toBe(400);
  });
});

// O ponto crítico: a materialização roda em toda leitura do mês. Se não for
// idempotente, o aluguel é lançado de novo a cada refresh da tela.
describe('idempotência da geração', () => {
  it('não duplica a despesa fixa por mais que o mês seja lido', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
      await request(app).get(`/api/summary?year=${year}&month=${month}`).set(auth);
    }
    const res = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    const aluguel = res.body.filter((e: { description: string }) => e.description === 'Aluguel');
    expect(aluguel).toHaveLength(1);
  });

  it('não gera despesa fixa para meses futuros', async () => {
    const futuro = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const res = await request(app)
      .get(`/api/expenses?year=${futuro.year}&month=${futuro.month}`)
      .set(auth);
    expect(res.body.filter((e: { description: string }) => e.description === 'Aluguel')).toHaveLength(0);
  });

  it('não gera despesa fixa antes do mês inicial do template', async () => {
    const anterior = prevMonth();
    const res = await request(app)
      .get(`/api/expenses?year=${anterior.year}&month=${anterior.month}`)
      .set(auth);
    expect(res.body.filter((e: { description: string }) => e.description === 'Aluguel')).toHaveLength(0);
  });
});

describe('PUT /api/recurring/:id', () => {
  it('atualiza o template e a despesa já gerada do mês corrente', async () => {
    const list = await request(app).get('/api/recurring').set(auth);
    const aluguel = list.body.find((t: { description: string }) => t.description === 'Aluguel');

    const res = await request(app).put(`/api/recurring/${aluguel.id}`).set(auth).send({ amount: 1350 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1350);

    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    const gerada = expenses.body.find((e: { description: string }) => e.description === 'Aluguel');
    expect(gerada.amount).toBe(1350);
  });

  it('pausar o template impede novas gerações', async () => {
    const created = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Streaming', amount: 40, dayOfMonth: 5 });

    await request(app).delete(`/api/recurring/${created.body.id}?deleteGenerated=1`).set(auth);

    const pausado = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Streaming', amount: 40, dayOfMonth: 5, active: false });
    expect(pausado.body.active).toBe(false);

    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    expect(
      expenses.body.filter((e: { description: string }) => e.description === 'Streaming'),
    ).toHaveLength(0);
  });

  it('404 para template de outro usuário', async () => {
    const outro = await request(app).post('/api/auth/register').send({
      name: 'Outro',
      email: `outro-recurring-${Date.now()}@example.com`,
      password: 'senha-forte-123',
    });
    const list = await request(app).get('/api/recurring').set(auth);
    const res = await request(app)
      .put(`/api/recurring/${list.body[0].id}`)
      .set({ Authorization: `Bearer ${outro.body.token}` })
      .send({ amount: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/recurring/:id', () => {
  it('por padrão preserva o histórico já lançado', async () => {
    const created = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Academia', amount: 99, dayOfMonth: 15 });

    await request(app).delete(`/api/recurring/${created.body.id}`).set(auth);

    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    const academia = expenses.body.find((e: { description: string }) => e.description === 'Academia');
    expect(academia).toBeDefined();
    // Mantida, mas sem vínculo — não volta a ser gerada.
    expect(academia.recurringExpenseId).toBeNull();
  });

  it('com deleteGenerated=1 apaga também as despesas geradas', async () => {
    const created = await request(app)
      .post('/api/recurring')
      .set(auth)
      .send({ description: 'Nuvem', amount: 25, dayOfMonth: 20 });

    await request(app).delete(`/api/recurring/${created.body.id}?deleteGenerated=1`).set(auth);

    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(auth);
    expect(expenses.body.filter((e: { description: string }) => e.description === 'Nuvem')).toHaveLength(0);
  });
});

describe('POST /api/recurring/import', () => {
  it('transforma despesas marcadas como recorrentes em templates, sem duplicar o mês', async () => {
    const importUser = { name: 'Import', email: `import-${Date.now()}@example.com`, password: 'senha-forte-123' };
    const reg = await request(app).post('/api/auth/register').send(importUser);
    const importAuth = { Authorization: `Bearer ${reg.body.token}` };

    await request(app)
      .post('/api/expenses')
      .set(importAuth)
      .send({
        description: 'Internet',
        amount: 110,
        date: `${year}-${String(month).padStart(2, '0')}-08`,
        recurring: true,
      });

    const res = await request(app).post(`/api/recurring/import?year=${year}&month=${month}`).set(importAuth);
    expect(res.status).toBe(200);
    expect(res.body.importedCount).toBe(1);
    expect(res.body.imported).toContain('Internet');

    // A despesa que originou o template não pode virar duas.
    const expenses = await request(app).get(`/api/expenses?year=${year}&month=${month}`).set(importAuth);
    expect(expenses.body.filter((e: { description: string }) => e.description === 'Internet')).toHaveLength(1);

    // Rodar de novo não cria template repetido.
    const again = await request(app).post(`/api/recurring/import?year=${year}&month=${month}`).set(importAuth);
    expect(again.body.importedCount).toBe(0);
  });
});
