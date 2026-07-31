import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { collectDigest, collectWater } from '../src/telegramNotifier';
import { buildDailyDigest, buildWaterReminder } from '../src/lib/notifications';
import { todayIso } from '../src/lib/dates';
import { currentYearMonth } from '../src/lib/month';

const app = createApp();

let userId: string;
let auth: { Authorization: string };
const { year, month } = currentYearMonth();
const today = todayIso();
const todayDay = Number(today.slice(8, 10));

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Rafael Notificações',
    email: `notifier-${Date.now()}@example.com`,
    password: 'senha-forte-123',
  });
  auth = { Authorization: `Bearer ${res.body.token}` };
  userId = res.body.user.id;

  await request(app).put(`/api/salary/${year}/${month}`).set(auth).send({ amount: 4000 });

  // Uma fixa vencendo HOJE e outra num dia distante, para conferir o filtro.
  await request(app)
    .post('/api/recurring')
    .set(auth)
    .send({ description: 'Aluguel', amount: 1200, dayOfMonth: todayDay });
  await request(app)
    .post('/api/recurring')
    .set(auth)
    .send({ description: 'Distante', amount: 90, dayOfMonth: todayDay > 15 ? 2 : 28 });
});

describe('coleta do resumo diário', () => {
  it('traz o saldo do mês a partir dos dados reais', async () => {
    const d = await collectDigest(userId, 'Rafael Notificações');
    // Renda 4000, gastos = as duas fixas (1200 + 90).
    expect(d.finance?.income).toBe(4000);
    expect(d.finance?.spent).toBe(1290);
    expect(d.finance?.remaining).toBe(2710);
  });

  it('lista só as fixas que vencem hoje ou amanhã', async () => {
    const d = await collectDigest(userId, 'Rafael');
    expect(d.dueSoon.map((x) => x.description)).toEqual(['Aluguel']);
    expect(d.dueSoon[0].daysUntil).toBe(0);
  });

  it('inclui prova dentro de 14 dias e ignora as distantes', async () => {
    const em3dias = new Date(`${today}T12:00:00.000Z`);
    em3dias.setUTCDate(em3dias.getUTCDate() + 3);
    const em60dias = new Date(`${today}T12:00:00.000Z`);
    em60dias.setUTCDate(em60dias.getUTCDate() + 60);

    await request(app)
      .post('/api/studies/exams')
      .set(auth)
      .send({ title: 'Cálculo II', date: em3dias.toISOString().slice(0, 10) });
    await request(app)
      .post('/api/studies/exams')
      .set(auth)
      .send({ title: 'Muito longe', date: em60dias.toISOString().slice(0, 10) });

    const d = await collectDigest(userId, 'Rafael');
    expect(d.exams.map((e) => e.title)).toEqual(['Cálculo II']);
    expect(d.exams[0].daysUntil).toBe(3);
  });

  it('pega tarefa atrasada com o sinal certo', async () => {
    const ontem = new Date(`${today}T12:00:00.000Z`);
    ontem.setUTCDate(ontem.getUTCDate() - 1);

    await request(app)
      .post('/api/studies/tasks')
      .set(auth)
      .send({ title: 'Relatório', dueDate: ontem.toISOString().slice(0, 10) });

    const d = await collectDigest(userId, 'Rafael');
    expect(d.lateTasks[0]).toMatchObject({ title: 'Relatório', daysUntil: -1 });
  });

  it('gera uma mensagem legível de ponta a ponta', async () => {
    const d = await collectDigest(userId, 'Rafael Notificações');
    const msg = buildDailyDigest(d);
    expect(msg).toContain('Bom dia, Rafael!');
    expect(msg).toContain('Aluguel vence hoje — R$ 1.200,00');
    expect(msg).toContain('Cálculo II em 3 dias');
    expect(msg).toContain('Relatório — 1d atrasada');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('NaN');
  });
});

describe('coleta do lembrete de água', () => {
  it('usa a meta padrão quando não há meta definida', async () => {
    const w = await collectWater(userId);
    expect(w.goalMl).toBe(3000);
    expect(w.consumedMl).toBe(0);
  });

  it('soma o consumo do dia e some quando a meta é batida', async () => {
    await request(app).post('/api/water/entries').set(auth).send({ amountMl: 1800 });
    const parcial = await collectWater(userId);
    expect(parcial.consumedMl).toBe(1800);
    expect(buildWaterReminder(parcial)).toContain('60%');

    await request(app).post('/api/water/entries').set(auth).send({ amountMl: 1200 });
    const completo = await collectWater(userId);
    expect(completo.consumedMl).toBe(3000);
    expect(buildWaterReminder(completo)).toBeNull();
  });
});

// A garantia de "uma mensagem por dia" é a unique constraint, não um flag em
// memória — assim reiniciar o servidor não faz o bot repetir o aviso.
describe('log de envio', () => {
  it('impede registrar o mesmo aviso duas vezes no mesmo dia', async () => {
    await prisma.notificationLog.create({
      data: { userId, jobKey: 'daily-digest', sentDate: today },
    });

    await expect(
      prisma.notificationLog.create({
        data: { userId, jobKey: 'daily-digest', sentDate: today },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('permite o mesmo aviso em dias diferentes e avisos diferentes no mesmo dia', async () => {
    await expect(
      prisma.notificationLog.create({
        data: { userId, jobKey: 'daily-digest', sentDate: '2020-01-01' },
      }),
    ).resolves.toBeTruthy();

    await expect(
      prisma.notificationLog.create({
        data: { userId, jobKey: 'water-reminder', sentDate: today },
      }),
    ).resolves.toBeTruthy();
  });
});
