import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const user = {
  name: 'Teste Chat',
  email: `chat-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

let token: string;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send(user);
  token = res.body.token;
});

describe('GET /api/chat/status', () => {
  it('reporta desabilitado quando ANTHROPIC_API_KEY não está configurada', async () => {
    const res = await request(app).get('/api/chat/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it('exige autenticação', async () => {
    const res = await request(app).get('/api/chat/status');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/chat/parse', () => {
  it('responde 503 quando o chat está desabilitado', async () => {
    const res = await request(app)
      .post('/api/chat/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'gastei 50 no mercado' });
    expect(res.status).toBe(503);
  });

  it('aplica rate limit por usuário após muitas chamadas em sequência', async () => {
    // O limiter é global ao router e conta mesmo em respostas 503 (chat
    // desabilitado), então basta estourar o limite de 20/min.
    const calls = Array.from({ length: 21 }, () =>
      request(app)
        .post('/api/chat/parse')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'gastei 10 no mercado' }),
    );
    const results = await Promise.all(calls);
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(429);
  });
});
