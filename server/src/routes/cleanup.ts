/**
 * Limpeza de lançamentos de um mês — apagar tudo de uma vez sem ter que
 * excluir item por item. A tela manda os ids do que deve sumir, então o mesmo
 * endpoint atende "limpar o mês inteiro" e "limpar só estes aqui".
 */

import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, parseBody } from '../lib/http';
import { monthRange } from '../lib/month';
import { markRecurringCleared } from '../lib/recurring';
import { monthCleanupSchema } from '../validation/schemas';

export const cleanupRouter = Router();

cleanupRouter.use(requireAuth);

cleanupRouter.post(
  '/month',
  asyncHandler(async (req, res) => {
    const { year, month, expenseIds, incomeIds } = parseBody(monthCleanupSchema, req.body);
    const userId = req.userId!;
    const { start, end } = monthRange(year, month);

    // O filtro por userId e pela janela do mês é o que impede apagar coisa de
    // outro usuário ou de outro mês por id forjado — os ids sozinhos não bastam.
    const scope = { userId, date: { gte: start, lt: end } };

    const targetExpenses = expenseIds.length
      ? await prisma.expense.findMany({
          where: { ...scope, id: { in: expenseIds } },
          select: { id: true, recurringExpenseId: true },
        })
      : [];

    const [expensesDeleted, incomesDeleted] = await prisma.$transaction([
      prisma.expense.deleteMany({ where: { ...scope, id: { in: targetExpenses.map((e) => e.id) } } }),
      prisma.income.deleteMany({ where: { ...scope, id: { in: incomeIds } } }),
    ]);

    // Apagou algum gasto fixo? Sem esta marca ele reapareceria na próxima
    // leitura do mês, gerado de novo a partir do template.
    if (targetExpenses.some((e) => e.recurringExpenseId)) {
      await markRecurringCleared(prisma, userId, year, month);
    }

    res.json({
      expensesDeleted: expensesDeleted.count,
      incomesDeleted: incomesDeleted.count,
    });
  }),
);
