import { centsToReais } from './money';

// Tipos mínimos vindos do Prisma que precisamos serializar.
interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  date: Date;
  categoryId: string | null;
  accountId: string | null;
  recurring: boolean;
  createdAt: Date;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
}

/** Converte uma despesa do banco (centavos) para o formato da API (reais). */
export function serializeExpense(e: ExpenseRow) {
  return {
    id: e.id,
    description: e.description,
    amount: centsToReais(e.amount),
    date: e.date.toISOString().slice(0, 10), // AAAA-MM-DD
    categoryId: e.categoryId,
    accountId: e.accountId,
    recurring: e.recurring,
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeCategory(c: CategoryRow) {
  return { id: c.id, name: c.name, color: c.color };
}

interface InvestmentRow {
  id: string;
  description: string;
  type: string;
  kind: string;
  amount: number;
  date: Date;
  notes: string | null;
  createdAt: Date;
}

export function serializeInvestment(i: InvestmentRow) {
  return {
    id: i.id,
    description: i.description,
    type: i.type,
    kind: i.kind,
    amount: centsToReais(i.amount),
    date: i.date.toISOString().slice(0, 10),
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  };
}
