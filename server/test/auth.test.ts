import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const user = {
  name: 'Teste Auth',
  email: `auth-test-${Date.now()}@example.com`,
  password: 'senha-forte-123',
};

describe('POST /api/auth/register', () => {
  it('cria uma conta e devolve um token', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: user.name, email: user.email });
  });

  it('rejeita e-mail duplicado', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já existe/i);
  });

  it('rejeita corpo inválido (sem senha)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('autentica com credenciais corretas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejeita senha incorreta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'senha-errada' });
    expect(res.status).toBe(401);
  });

  it('rejeita e-mail inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@example.com', password: 'qualquer' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    token = res.body.token;
  });

  it('rejeita sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejeita token inválido', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  it('devolve os dados do usuário autenticado', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: user.name, email: user.email });
  });
});

// O app não tem tela de login: /auth/auto é o único caminho de entrada e
// precisa funcionar sempre — inclusive num banco vazio, criando a conta do
// dono na primeira execução.
describe('POST /api/auth/auto (app sem tela de login)', () => {
  it('devolve token e usuário sem receber credencial nenhuma', async () => {
    const res = await request(app).post('/api/auth/auto').send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ id: expect.any(String), email: expect.any(String) });
  });

  it('o token devolvido é aceito nas rotas autenticadas', async () => {
    const auto = await request(app).post('/api/auth/auto').send({});
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${auto.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(auto.body.user.id);
  });

  it('entra sempre na mesma conta (a mais antiga), não cria uma nova a cada chamada', async () => {
    const a = await request(app).post('/api/auth/auto').send({});
    const b = await request(app).post('/api/auth/auto').send({});
    expect(a.body.user.id).toBe(b.body.user.id);
  });
});
