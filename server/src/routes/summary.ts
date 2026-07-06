import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { readYearMonth } from '../lib/query';
import { monthRange } from '../lib/month';
import {
  computeSummary,
  computeAccountBreakdown,
  computeIncomeSummary,
  statusFor,
  type AccountKind,
} from '../lib/budget';
import { centsToReais } from '../lib/money';
import { ensureAccountsForUser } from '../lib/accounts';

export const summaryRouter = Router();

summaryRouter.use(requireAuth);

// Resumo do mês: renda (salário + VR + avulsos), gasto por conta, saldo da
// carteira e quanto ainda dá pra gastar (renda disponível − gasto do mês).
summaryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month } = readYearMonth(req);
    const { start, end } = monthRange(year, month);
    const userId = req.userId!;

    await ensureAccountsForUser(prisma, userId);

    const [budget, salary, voucher, walletBase, expenses, incomes, categories, accounts] =
      await Promise.all([
        prisma.monthlyBudget.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.monthlySalary.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.monthlyVoucher.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.monthlyWalletBase.findUnique({
          where: { userId_year_month: { userId, year, month } },
        }),
        prisma.expense.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: { amount: true, categoryId: true, accountId: true, recurring: true },
        }),
        prisma.income.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: { amount: true, accountId: true },
        }),
        prisma.category.findMany({
          where: { userId },
          select: { id: true, name: true, color: true },
        }),
        prisma.account.findMany({ where: { userId } }),
      ]);

    const summary = computeSummary(budget?.amount ?? 0, expenses, categories);

    const accountKindById = new Map<string, AccountKind>(accounts.map((a) => [a.id, a.kind]));
    const accountBreakdown = computeAccountBreakdown(expenses, accountKindById);

    // "Extra" (renda avulsa) exclui lançamentos ligados à Carteira — esses já
    // entram no cálculo do saldo da carteira do mês, então contá-los aqui de
    // novo duplicaria o valor disponível.
    const nonWalletIncomes = incomes.filter((i) => {
      const kind = i.accountId ? accountKindById.get(i.accountId) : undefined;
      return kind !== 'WALLET';
    });
    const income = computeIncomeSummary(salary?.amount ?? 0, voucher?.amount ?? 0, nonWalletIncomes);

    // Saldo da carteira (Pix) do MÊS: base editável pelo usuário + receitas
    // de Pix lançadas no mês − gastos de Pix no mês. Não acumula sozinho de
    // um mês pro outro — o usuário reajusta a base quando quiser.
    const walletIncomeCents = incomes
      .filter((i) => i.accountId && accountKindById.get(i.accountId) === 'WALLET')
      .reduce((sum, i) => sum + i.amount, 0);
    const walletBalanceCents = (walletBase?.amount ?? 0) + walletIncomeCents - accountBreakdown.wallet;

    // "Ainda posso gastar" = tudo que está disponível pra gastar este mês
    // (salário + VR + renda avulsa + saldo da carteira) menos o que já foi
    // gasto este mês fora da carteira. O gasto da carteira já foi descontado
    // do próprio saldo dela, então não é subtraído de novo aqui.
    const totalAvailable = income.total + walletBalanceCents;
    const spentExcludingWallet =
      accountBreakdown.fixed + accountBreakdown.variable + accountBreakdown.foodVoucher;
    const remainingCents = totalAvailable - spentExcludingWallet;
    const percentUsed = totalAvailable > 0 ? spentExcludingWallet / totalAvailable : 0;
    const status = statusFor(percentUsed, totalAvailable > 0);

    res.json({
      year,
      month,
      // Orçamento (meta opcional definida em Ajustes) — mantido para quem só
      // quer acompanhar limite de gasto, sem usar o modelo de renda.
      budget: centsToReais(summary.budget),
      totalSpent: centsToReais(summary.totalSpent),
      remaining: centsToReais(remainingCents),
      percentUsed,
      status,
      expenseCount: expenses.length,
      byCategory: summary.byCategory.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        color: c.color,
        spent: centsToReais(c.spent),
      })),
      // Renda do mês (salário + VR fixos + lançamentos avulsos não ligados à carteira).
      income: {
        salary: centsToReais(income.salary),
        voucher: centsToReais(income.voucher),
        extra: centsToReais(income.extra),
        total: centsToReais(income.total),
      },
      // Gasto por conta de origem.
      accounts: {
        fixed: centsToReais(accountBreakdown.fixed),
        variable: centsToReais(accountBreakdown.variable),
        foodVoucher: centsToReais(accountBreakdown.foodVoucher),
        wallet: centsToReais(accountBreakdown.wallet),
        total: centsToReais(accountBreakdown.total),
      },
      // Sobra do mês = renda total (sem carteira) − gasto total (todas as contas).
      monthSurplus: centsToReais(income.total - accountBreakdown.total),
      // Saldo da carteira (Pix) do mês corrente (base editável + fluxo do mês).
      walletBalance: centsToReais(walletBalanceCents),
      // Base editável da carteira (valor bruto, sem o fluxo do mês) — usada
      // para preencher o modal de edição.
      walletBase: centsToReais(walletBase?.amount ?? 0),
    });
  }),
);
