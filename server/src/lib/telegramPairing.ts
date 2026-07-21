/**
 * Estado em memória do pareamento com o Telegram: códigos de vínculo
 * (usuário -> chatId) e confirmações pendentes (despesa/receita interpretada
 * aguardando o usuário apertar "Confirmar" no botão inline do Telegram).
 * Não precisa persistir em banco: códigos e pendências são de curta duração
 * e, se o servidor reiniciar, o usuário simplesmente gera/envia de novo.
 */

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

interface PairingCode {
  userId: string;
  expiresAt: number;
}

export interface PendingExpense {
  kind: 'expense';
  userId: string;
  description: string;
  amount: number;
  date: string;
  categoryId: string | null;
}

export interface PendingIncome {
  kind: 'income';
  userId: string;
  description: string;
  amount: number;
  date: string;
}

type Pending = PendingExpense | PendingIncome;

const pairingCodes = new Map<string, PairingCode>();
const pending = new Map<string, Pending & { expiresAt: number }>();

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createPairingCode(userId: string): string {
  const code = randomCode();
  pairingCodes.set(code, { userId, expiresAt: Date.now() + PAIRING_CODE_TTL_MS });
  return code;
}

/** Consome o código (uso único) e retorna o userId, ou null se inválido/expirado. */
export function consumePairingCode(code: string): string | null {
  const entry = pairingCodes.get(code);
  pairingCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

export function createPending(data: Pending): string {
  const id = Math.random().toString(36).slice(2, 10);
  pending.set(id, { ...data, expiresAt: Date.now() + PENDING_TTL_MS });
  return id;
}

export function takePending(id: string): Pending | null {
  const entry = pending.get(id);
  pending.delete(id);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

// Limpeza periódica de entradas expiradas (evita crescimento indefinido dos Maps).
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of pairingCodes) if (entry.expiresAt < now) pairingCodes.delete(code);
  for (const [id, entry] of pending) if (entry.expiresAt < now) pending.delete(id);
}, 5 * 60 * 1000).unref();
