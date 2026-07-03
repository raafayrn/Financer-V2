/**
 * Regras de cálculo de orçamento x gasto. Funções PURAS trabalhando em
 * CENTAVOS — sem acesso a banco, para facilitar os testes. Este é o coração
 * do app: "quanto ainda posso gastar no mês".
 */

export type BudgetStatus = 'ok' | 'warning' | 'over';

export interface CategorySpent {
  categoryId: string | null;
  categoryName: string;
  color: string;
  spent: number; // centavos
}

export interface BudgetSummary {
  /** Orçamento do mês em centavos (0 se não definido). */
  budget: number;
  /** Total já gasto no mês em centavos. */
  totalSpent: number;
  /** Quanto ainda resta para gastar (pode ser negativo se passou do limite). */
  remaining: number;
  /** Proporção gasto/orçamento (0..>1). 0 quando não há orçamento definido. */
  percentUsed: number;
  /** Indicador visual de situação. */
  status: BudgetStatus;
  /** Gasto por categoria (ordenado do maior para o menor). */
  byCategory: CategorySpent[];
}

/** Limiares (proporção do orçamento) para o status visual. */
export const WARNING_THRESHOLD = 0.8; // amarelo a partir de 80%
export const OVER_THRESHOLD = 1.0; // vermelho quando passa de 100%

export function statusFor(percentUsed: number, hasBudget: boolean): BudgetStatus {
  if (!hasBudget) return 'ok';
  if (percentUsed >= OVER_THRESHOLD) return 'over';
  if (percentUsed >= WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

export interface ExpenseInput {
  amount: number; // centavos
  categoryId: string | null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

/**
 * Calcula o resumo do mês a partir do orçamento (centavos) e da lista de
 * despesas. `categories` é usado apenas para enriquecer o detalhamento por
 * categoria com nome e cor.
 */
export function computeSummary(
  budget: number,
  expenses: ExpenseInput[],
  categories: CategoryInfo[] = [],
): BudgetSummary {
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = budget - totalSpent;
  const hasBudget = budget > 0;
  const percentUsed = hasBudget ? totalSpent / budget : 0;

  const byId = new Map(categories.map((c) => [c.id, c]));
  const spentByCategory = new Map<string | null, number>();
  for (const e of expenses) {
    const key = e.categoryId ?? null;
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + e.amount);
  }

  const byCategory: CategorySpent[] = Array.from(spentByCategory.entries())
    .map(([categoryId, spent]) => {
      const info = categoryId ? byId.get(categoryId) : undefined;
      return {
        categoryId,
        categoryName: info?.name ?? 'Sem categoria',
        color: info?.color ?? '#94a3b8',
        spent,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  return {
    budget,
    totalSpent,
    remaining,
    percentUsed,
    status: statusFor(percentUsed, hasBudget),
    byCategory,
  };
}

/**
 * Contas fixas do usuário (ver server/prisma/schema.prisma § Account).
 * CREDIT_CARD é o padrão para despesas sem conta definida (compatibilidade
 * com lançamentos antigos, de antes desse conceito existir).
 */
export type AccountKind = 'CREDIT_CARD' | 'FOOD_VOUCHER' | 'WALLET';

export interface ExpenseWithAccount {
  amount: number; // centavos
  accountId: string | null;
  recurring: boolean;
}

export interface AccountBreakdown {
  /** Cartão de crédito, despesas marcadas como recorrentes. */
  fixed: number;
  /** Cartão de crédito, despesas não recorrentes. */
  variable: number;
  /** Vale-alimentação (ex.: energéticos). */
  foodVoucher: number;
  /** Carteira / Pix. */
  wallet: number;
  /** Soma de todas as contas. */
  total: number;
}

/**
 * Divide as despesas do mês por conta de origem — cartão (fixo/variável),
 * vale-alimentação e carteira — para o card "Gasto até agora" do dashboard.
 */
export function computeAccountBreakdown(
  expenses: ExpenseWithAccount[],
  accountKindById: Map<string, AccountKind>,
): AccountBreakdown {
  let fixed = 0;
  let variable = 0;
  let foodVoucher = 0;
  let wallet = 0;

  for (const e of expenses) {
    const kind = e.accountId ? accountKindById.get(e.accountId) : undefined;
    if (kind === 'FOOD_VOUCHER') {
      foodVoucher += e.amount;
    } else if (kind === 'WALLET') {
      wallet += e.amount;
    } else if (e.recurring) {
      fixed += e.amount;
    } else {
      variable += e.amount;
    }
  }

  return { fixed, variable, foodVoucher, wallet, total: fixed + variable + foodVoucher + wallet };
}

export interface IncomeSummary {
  /** Salário fixo do mês, em centavos. */
  salary: number;
  /** Soma dos lançamentos de renda avulsos do mês (ex.: vale convertido). */
  extra: number;
  /** salary + extra. */
  total: number;
}

/** Soma o salário fixo do mês com os lançamentos de renda avulsos. */
export function computeIncomeSummary(
  salary: number,
  incomes: { amount: number }[],
): IncomeSummary {
  const extra = incomes.reduce((sum, i) => sum + i.amount, 0);
  return { salary, extra, total: salary + extra };
}
