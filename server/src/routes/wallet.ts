import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { centsToReais } from '../lib/money';
import { ensureAccountsForUser } from '../lib/accounts';

export const walletRouter = Router();

walletRouter.use(requireAuth);

/**
 * Saldo da carteira (Pix): acumula indefinidamente, ao contrário do
 * orçamento/renda que são por mês. balance = soma de todo o Income lançado
 * na conta WALLET menos soma de toda Expense lançada na conta WALLET.
 */
walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    await ensureAccountsForUser(prisma, userId);
    const wallet = await prisma.account.findFirst({ where: { userId, kind: 'WALLET' } });

    if (!wallet) {
      res.json({ balance: 0 });
      return;
    }

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.income.aggregate({
        where: { userId, accountId: wallet.id },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { userId, accountId: wallet.id },
        _sum: { amount: true },
      }),
    ]);

    const balanceCents = (incomeAgg._sum.amount ?? 0) - (expenseAgg._sum.amount ?? 0);
    res.json({ balance: centsToReais(balanceCents) });
  }),
);
