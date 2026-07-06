import { prisma } from '../prisma';
import { monthRange } from './month';
import { centsToReais } from './money';
import { computeSummary, computeAccountBreakdown, computeIncomeSummary, type AccountKind } from './budget';

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function monthName(month: number): string {
  return MONTH_NAMES_PT[month - 1] ?? String(month);
}

/**
 * Monta um resumo em texto dos dados financeiros reais do usuário (mês atual
 * + mês anterior, para permitir perguntas comparativas), para servir de
 * contexto ao Gemini responder perguntas sem inventar números.
 */
export async function buildFinancialContext(
  userId: string,
  year: number,
  month: number,
): Promise<string> {
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = prevDate.getUTCMonth() + 1;

  const [current, previous] = await Promise.all([
    monthSnapshot(userId, year, month),
    monthSnapshot(userId, prevYear, prevMonth),
  ]);

  const walletBalance = await walletBalanceForMonth(userId, year, month);

  return [
    `## ${monthName(month)}/${year} (mês atual)`,
    current,
    '',
    `## ${monthName(prevMonth)}/${prevYear} (mês anterior)`,
    previous,
    '',
    `## Carteira (Pix)`,
    `Saldo do mês atual: R$ ${walletBalance.toFixed(2)}`,
  ].join('\n');
}

async function monthSnapshot(userId: string, year: number, month: number): Promise<string> {
  const { start, end } = monthRange(year, month);

  const [budget, salary, voucher, expenses, incomes, categories, accounts] = await Promise.all([
    prisma.monthlyBudget.findUnique({ where: { userId_year_month: { userId, year, month } } }),
    prisma.monthlySalary.findUnique({ where: { userId_year_month: { userId, year, month } } }),
    prisma.monthlyVoucher.findUnique({ where: { userId_year_month: { userId, year, month } } }),
    prisma.expense.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: {
        amount: true,
        categoryId: true,
        accountId: true,
        recurring: true,
        description: true,
      },
    }),
    prisma.income.findMany({ where: { userId, date: { gte: start, lt: end } }, select: { amount: true } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, color: true } }),
    prisma.account.findMany({ where: { userId } }),
  ]);

  const summary = computeSummary(budget?.amount ?? 0, expenses, categories);
  const income = computeIncomeSummary(salary?.amount ?? 0, voucher?.amount ?? 0, incomes);
  const accountKindById = new Map<string, AccountKind>(accounts.map((a) => [a.id, a.kind]));
  const accountBreakdown = computeAccountBreakdown(expenses, accountKindById);

  const lines: string[] = [];
  lines.push(`Renda: R$ ${centsToReais(income.total).toFixed(2)} (salário R$ ${centsToReais(income.salary).toFixed(2)} + VR R$ ${centsToReais(income.voucher).toFixed(2)} + outros R$ ${centsToReais(income.extra).toFixed(2)})`);
  lines.push(`Gasto total: R$ ${centsToReais(accountBreakdown.total).toFixed(2)}`);
  lines.push(`  - Cartão fixo (recorrente): R$ ${centsToReais(accountBreakdown.fixed).toFixed(2)}`);
  lines.push(`  - Cartão variável: R$ ${centsToReais(accountBreakdown.variable).toFixed(2)}`);
  lines.push(`  - Vale-alimentação: R$ ${centsToReais(accountBreakdown.foodVoucher).toFixed(2)}`);
  lines.push(`  - Carteira/Pix: R$ ${centsToReais(accountBreakdown.wallet).toFixed(2)}`);
  lines.push(`Sobra do mês (renda - gasto): R$ ${centsToReais(income.total - accountBreakdown.total).toFixed(2)}`);

  if (summary.byCategory.length > 0) {
    lines.push('Gasto por categoria:');
    for (const c of summary.byCategory) {
      lines.push(`  - ${c.categoryName}: R$ ${centsToReais(c.spent).toFixed(2)}`);
    }
  }

  const recurring = expenses.filter((e) => e.recurring);
  if (recurring.length > 0) {
    lines.push('Despesas fixas/recorrentes deste mês:');
    for (const e of recurring) {
      lines.push(`  - ${e.description}: R$ ${centsToReais(e.amount).toFixed(2)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Saldo da carteira (Pix) do mês: base editável + receitas de Pix do mês −
 * gastos de Pix do mês. Mesma lógica usada em routes/summary.ts.
 */
async function walletBalanceForMonth(userId: string, year: number, month: number): Promise<number> {
  const { start, end } = monthRange(year, month);
  const [walletBase, accounts, incomes, expenses] = await Promise.all([
    prisma.monthlyWalletBase.findUnique({ where: { userId_year_month: { userId, year, month } } }),
    prisma.account.findMany({ where: { userId } }),
    prisma.income.findMany({ where: { userId, date: { gte: start, lt: end } }, select: { amount: true, accountId: true } }),
    prisma.expense.findMany({ where: { userId, date: { gte: start, lt: end } }, select: { amount: true, accountId: true } }),
  ]);

  const accountKindById = new Map(accounts.map((a) => [a.id, a.kind]));
  const walletIncome = incomes
    .filter((i) => i.accountId && accountKindById.get(i.accountId) === 'WALLET')
    .reduce((sum, i) => sum + i.amount, 0);
  const walletExpense = expenses
    .filter((e) => e.accountId && accountKindById.get(e.accountId) === 'WALLET')
    .reduce((sum, e) => sum + e.amount, 0);

  return centsToReais((walletBase?.amount ?? 0) + walletIncome - walletExpense);
}
