import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { findDuplicate, mergeIntoExisting } from '../src/lib/ingestDedupe';

const app = createApp();

let userId: string;

async function registerUser(prefix: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Teste Dedupe',
      email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'senha-forte-123',
    });
  return res.body.user.id;
}

beforeAll(async () => {
  userId = await registerUser('dedupe-test');
});

/**
 * A dedup é exercitada direto, sem passar pelo parser: o que precisa de
 * cobertura é a regra de correspondência, e testá-la pela rota faria os casos
 * do canal e-mail dependerem de uma chamada paga à IA.
 */
interface Row {
  amount: number | null;
  occurredAt: Date | null;
  source: string;
  merchant: string;
  transactionType?: string;
  status?: string;
  owner?: string;
}

async function ingest(row: Row) {
  return prisma.expenseIngestion.create({
    data: {
      userId: row.owner ?? userId,
      amount: row.amount,
      occurredAt: row.occurredAt,
      source: row.source,
      merchant: row.merchant,
      transactionType: row.transactionType ?? 'credit_purchase',
      status: row.status ?? 'pending',
      parseConfidence: 'high',
      rawPayload: '{}',
    },
  });
}

/** Roda a resolução completa (buscar duplicata + fundir), como a rota faz. */
async function resolve(incoming: Awaited<ReturnType<typeof ingest>>) {
  const match = await findDuplicate(prisma, {
    userId: incoming.userId,
    amount: incoming.amount,
    occurredAt: incoming.occurredAt,
    transactionType: incoming.transactionType,
    source: incoming.source,
    excludeId: incoming.id,
  });
  if (!match) return { outcome: 'created' as const, row: incoming };
  const merged = await mergeIntoExisting(prisma, match, incoming);
  return {
    outcome: merged.source === 'email+shortcut' ? ('merged' as const) : ('ignored' as const),
    row: merged,
  };
}

const at = (iso: string) => new Date(iso);

describe('deduplicação — casos obrigatórios da especificação', () => {
  it('atalho 18:06 e e-mail da mesma hora recebido depois: 1 registro, dados do e-mail', async () => {
    const atalho = await ingest({
      amount: 15000,
      occurredAt: at('2026-09-01T18:06:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'material de construção',
    });
    const email = await ingest({
      amount: 15000,
      occurredAt: at('2026-09-01T18:06:00-03:00'),
      source: 'email',
      merchant: 'LEROY MERLIN',
    });

    const { outcome, row } = await resolve(email);

    expect(outcome).toBe('merged');
    expect(row.id).toBe(atalho.id);
    expect(row.source).toBe('email+shortcut');
    // O e-mail vence: nome real do estabelecimento, não o que foi digitado.
    expect(row.merchant).toBe('LEROY MERLIN');
    expect(JSON.parse(row.mergedFrom)).toContain(email.id);

    const perdedor = await prisma.expenseIngestion.findUnique({ where: { id: email.id } });
    expect(perdedor?.status).toBe('discarded');

    const pendentes = await prisma.expenseIngestion.count({
      where: { userId, status: 'pending', occurredAt: at('2026-09-01T18:06:00-03:00') },
    });
    expect(pendentes).toBe(1);
  });

  it('atalho 150,00 e e-mail 149,90 na janela: fundem (tolerância de R$ 0,50)', async () => {
    await ingest({
      amount: 15000,
      occurredAt: at('2026-09-02T10:00:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'padaria',
    });
    const email = await ingest({
      amount: 14990,
      occurredAt: at('2026-09-02T10:05:00-03:00'),
      source: 'email',
      merchant: 'PANIFICADORA',
    });

    const { outcome, row } = await resolve(email);
    expect(outcome).toBe('merged');
    // O valor exato do e-mail substitui o arredondado do atalho.
    expect(row.amount).toBe(14990);
  });

  it('atalho 150,00 e e-mail 158,00 na janela: não fundem', async () => {
    await ingest({
      amount: 15000,
      occurredAt: at('2026-09-03T10:00:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'mercado',
    });
    const email = await ingest({
      amount: 15800,
      occurredAt: at('2026-09-03T10:05:00-03:00'),
      source: 'email',
      merchant: 'MERCADO X',
    });

    const { outcome } = await resolve(email);
    expect(outcome).toBe('created');
  });

  it('atalho 18:06 e e-mail com hora de compra 18:45: não fundem (fora da janela)', async () => {
    await ingest({
      amount: 8000,
      occurredAt: at('2026-09-04T18:06:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'posto',
    });
    const email = await ingest({
      amount: 8000,
      occurredAt: at('2026-09-04T18:45:00-03:00'),
      source: 'email',
      merchant: 'POSTO SHELL',
    });

    const { outcome } = await resolve(email);
    expect(outcome).toBe('created');
  });

  it('e-mail primeiro e atalho depois: o atalho é descartado e o e-mail permanece', async () => {
    const email = await ingest({
      amount: 6000,
      occurredAt: at('2026-09-05T12:00:00-03:00'),
      source: 'email',
      merchant: 'RESTAURANTE REAL',
    });
    const atalho = await ingest({
      amount: 6000,
      occurredAt: at('2026-09-05T12:02:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'almoço',
    });

    const { outcome, row } = await resolve(atalho);

    expect(outcome).toBe('ignored');
    expect(row.id).toBe(email.id);
    // O atalho não promove nada: o e-mail já tinha o dado bom.
    expect(row.merchant).toBe('RESTAURANTE REAL');
    expect(row.source).toBe('email');

    const descartado = await prisma.expenseIngestion.findUnique({ where: { id: atalho.id } });
    expect(descartado?.status).toBe('discarded');
  });

  it('Pix recebido nunca entra na dedup — é entrada, não despesa', async () => {
    await ingest({
      amount: 20000,
      occurredAt: at('2026-09-06T09:00:00-03:00'),
      source: 'email',
      merchant: 'PIX RECEBIDO',
      transactionType: 'pix_in',
    });
    const outro = await ingest({
      amount: 20000,
      occurredAt: at('2026-09-06T09:05:00-03:00'),
      source: 'email',
      merchant: 'PIX RECEBIDO',
      transactionType: 'pix_in',
    });

    const { outcome } = await resolve(outro);
    expect(outcome).toBe('created');
  });

  it('e-mail de fechamento de fatura fica pendente sinalizado, não vira despesa', async () => {
    const fatura = await ingest({
      amount: null,
      occurredAt: null,
      source: 'email',
      merchant: 'Sua fatura fechou',
      transactionType: 'unknown',
    });

    const { outcome, row } = await resolve(fatura);
    expect(outcome).toBe('created');
    expect(row.status).toBe('pending');
    expect(row.transactionType).toBe('unknown');
  });
});

describe('deduplicação — limites da regra', () => {
  it('não funde com um lançamento já confirmado: entra como novo pendente', async () => {
    await ingest({
      amount: 4000,
      occurredAt: at('2026-09-07T15:00:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'café',
      status: 'confirmed',
    });
    const email = await ingest({
      amount: 4000,
      occurredAt: at('2026-09-07T15:03:00-03:00'),
      source: 'email',
      merchant: 'CAFETERIA',
    });

    const { outcome } = await resolve(email);
    expect(outcome).toBe('created');
  });

  it('não funde ingestões de outro usuário com o mesmo valor e hora', async () => {
    const outroId = await registerUser('dedupe-outro');

    await ingest({
      owner: outroId,
      amount: 9900,
      occurredAt: at('2026-09-08T20:00:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'compra do outro',
    });

    const meu = await ingest({
      amount: 9900,
      occurredAt: at('2026-09-08T20:01:00-03:00'),
      source: 'email',
      merchant: 'LOJA',
    });

    const { outcome } = await resolve(meu);
    expect(outcome).toBe('created');
  });

  it('sem hora da compra não há como comparar: entra como novo', async () => {
    await ingest({
      amount: 3000,
      occurredAt: at('2026-09-09T11:00:00-03:00'),
      source: 'wallet_shortcut',
      merchant: 'lanche',
    });
    const semHora = await ingest({
      amount: 3000,
      occurredAt: null,
      source: 'email',
      merchant: 'LANCHONETE',
    });

    const { outcome } = await resolve(semHora);
    expect(outcome).toBe('created');
  });
});
