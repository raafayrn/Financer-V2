import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const user = {
  name: 'Teste Ingest',
  email: `ingest-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let sessionToken: string;
let ingestToken: string;
let ingestTokenId: string;

beforeAll(async () => {
  const registerRes = await request(app).post('/api/auth/register').send(user);
  sessionToken = registerRes.body.token;

  const tokenRes = await request(app)
    .post('/api/ingest-tokens')
    .set('Authorization', `Bearer ${sessionToken}`)
    .send({ label: 'iPhone' });
  ingestToken = tokenRes.body.token;
  ingestTokenId = tokenRes.body.id;
});

describe('POST /api/ingest-tokens', () => {
  it('devolve o token em claro uma única vez e nunca mais', async () => {
    expect(ingestToken).toMatch(/^orb_/);

    const list = await request(app)
      .get('/api/ingest-tokens')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(list.status).toBe(200);
    const row = list.body.tokens.find((t: { id: string }) => t.id === ingestTokenId);
    expect(row.label).toBe('iPhone');
    expect(row.prefix).toBe(ingestToken.slice(0, 10));
    expect(row).not.toHaveProperty('token');
    expect(row).not.toHaveProperty('tokenHash');
  });
});

describe('POST /api/expenses/ingest — autenticação', () => {
  it('recusa sem token', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .send({ source: 'wallet_shortcut', text: '150 padaria', occurred_at: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('recusa token inventado', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', 'Bearer orb_naoexiste')
      .send({ source: 'wallet_shortcut', text: '150 padaria', occurred_at: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('não aceita o JWT da sessão — a porta dos canais é só para eles', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ source: 'wallet_shortcut', text: '150 padaria', occurred_at: new Date().toISOString() });
    expect(res.status).toBe(401);
  });

  it('recusa token revogado', async () => {
    const created = await request(app)
      .post('/api/ingest-tokens')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ label: 'Descartável' });

    await request(app)
      .post(`/api/ingest-tokens/${created.body.id}/revoke`)
      .set('Authorization', `Bearer ${sessionToken}`);

    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${created.body.token}`)
      .send({ source: 'wallet_shortcut', text: '10 café', occurred_at: new Date().toISOString() });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revogado/i);
  });
});

describe('POST /api/expenses/ingest — canal atalho', () => {
  it('grava como pendente e guarda o payload original', async () => {
    const occurredAt = '2026-08-25T18:06:00-03:00';
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({ source: 'wallet_shortcut', text: '150 material de construção', occurred_at: occurredAt });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('created');
    expect(res.body.expense.status).toBe('pending');
    expect(typeof res.body.message).toBe('string');
  });

  it('exige occurred_at — sem ele a deduplicação não teria sobre o que medir', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({ source: 'wallet_shortcut', text: '150 padaria' });
    expect(res.status).toBe(400);
  });

  it('recusa source desconhecida', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({ source: 'telepatia', text: '150' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/expenses/ingest — canal e-mail', () => {
  it('aceita o corpo do e-mail e grava pendente', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({
        source: 'email',
        subject: 'Compra aprovada',
        from: 'todomundo@nubank.com.br',
        body_text: 'Compra de R$ 150,00 aprovada em MATERIAL DE CONSTRUCAO',
        received_at: '2026-08-25T21:40:00-03:00',
      });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('pending');
  });

  it('recusa corpo vazio', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({ source: 'email', body_text: '' });
    expect(res.status).toBe(400);
  });
});

describe('parser na ingestão', () => {
  it('preenche valor e estabelecimento a partir da frase do atalho', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({
        source: 'wallet_shortcut',
        text: 'R$ 32,90 farmácia',
        occurred_at: '2026-08-25T18:06:00-03:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.expense.amount).toBe(32.9);
    expect(res.body.expense.merchant).toBe('farmácia');
    // A mensagem é o que o Atalho mostra na notificação depois do pagamento.
    expect(res.body.message).toContain('32,90');
  });

  it('frase sem número entra assim mesmo, sem valor — nada é descartado', async () => {
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({
        source: 'wallet_shortcut',
        text: 'almoço com o pessoal',
        occurred_at: '2026-08-25T12:30:00-03:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.expense.amount).toBeNull();
    expect(res.body.expense.status).toBe('pending');
    expect(res.body.message).toMatch(/pendente/i);
  });

  it('guarda o payload original e a hora da compra, não a de chegada', async () => {
    const { prisma } = await import('../src/prisma');
    const res = await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({
        source: 'wallet_shortcut',
        text: '77 posto',
        occurred_at: '2026-08-20T09:15:00-03:00',
      });

    const row = await prisma.expenseIngestion.findUnique({ where: { id: res.body.expense.id } });
    expect(row?.occurredAt?.toISOString()).toBe('2026-08-20T12:15:00.000Z');
    // receivedAt é agora; occurredAt é a hora da compra. Confundir os dois é
    // o que faz o e-mail atrasado não casar com o atalho na deduplicação.
    expect(row?.receivedAt.getTime()).toBeGreaterThan(row!.occurredAt!.getTime());
    expect(JSON.parse(row!.rawPayload).text).toBe('77 posto');
  });
});

describe('isolamento', () => {
  it('a ingestão não cria Expense — nada entra no mês sem confirmação', async () => {
    const now = new Date();
    await request(app)
      .post('/api/expenses/ingest')
      .set('Authorization', `Bearer ${ingestToken}`)
      .send({ source: 'wallet_shortcut', text: '99 teste isolamento', occurred_at: now.toISOString() });

    const expenses = await request(app)
      .get(`/api/expenses?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(expenses.status).toBe(200);
    const found = JSON.stringify(expenses.body).includes('teste isolamento');
    expect(found).toBe(false);
  });
});
