import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { serializeInvestment } from '../lib/serialize';
import { reaisToCents, centsToReais } from '../lib/money';
import { investmentCreateSchema, investmentUpdateSchema } from '../validation/schemas';

export const investmentsRouter = Router();

investmentsRouter.use(requireAuth);

/** Converte "AAAA-MM-DD" para um Date fixo às 12:00 UTC (evita drift de fuso). */
function parseInvestmentDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

// Lista todos os lançamentos de investimento do usuário (mais recentes primeiro).
investmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const investments = await prisma.investment.findMany({
      where: { userId: req.userId! },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(investments.map(serializeInvestment));
  }),
);

/**
 * Resumo: saldo total (aportes − resgates), saldo por tipo, aportes/resgates
 * do ano corrente e série mensal (aportes líquidos) do ano informado.
 * GET /api/investments/summary?year=2026
 */
investmentsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const year = req.query.year !== undefined ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      res.status(400).json({ error: 'Parâmetro year inválido.' });
      return;
    }

    const all = await prisma.investment.findMany({
      where: { userId },
      select: { amount: true, type: true, kind: true, date: true },
    });

    const signedAmount = (i: { amount: number; kind: string }) =>
      i.kind === 'RESGATE' ? -i.amount : i.amount;

    const totalBalance = all.reduce((sum, i) => sum + signedAmount(i), 0);

    const byTypeMap = new Map<string, number>();
    for (const i of all) {
      byTypeMap.set(i.type, (byTypeMap.get(i.type) ?? 0) + signedAmount(i));
    }
    const byType = Array.from(byTypeMap.entries())
      .map(([type, amount]) => ({ type, amount: centsToReais(amount) }))
      .filter((t) => t.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const inYear = all.filter((i) => i.date >= start && i.date < end);

    const contributionsByMonth = new Array(12).fill(0);
    const withdrawalsByMonth = new Array(12).fill(0);
    for (const i of inYear) {
      const m = i.date.getUTCMonth();
      if (i.kind === 'RESGATE') withdrawalsByMonth[m] += i.amount;
      else contributionsByMonth[m] += i.amount;
    }
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      contributed: centsToReais(contributionsByMonth[i]),
      withdrawn: centsToReais(withdrawalsByMonth[i]),
      net: centsToReais(contributionsByMonth[i] - withdrawalsByMonth[i]),
    }));

    const contributedYear = inYear.filter((i) => i.kind !== 'RESGATE').reduce((s, i) => s + i.amount, 0);
    const withdrawnYear = inYear.filter((i) => i.kind === 'RESGATE').reduce((s, i) => s + i.amount, 0);

    res.json({
      year,
      totalBalance: centsToReais(totalBalance),
      byType,
      months,
      totals: {
        contributedYear: centsToReais(contributedYear),
        withdrawnYear: centsToReais(withdrawnYear),
        netYear: centsToReais(contributedYear - withdrawnYear),
        entryCount: all.length,
      },
    });
  }),
);

investmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(investmentCreateSchema, req.body);

    const investment = await prisma.investment.create({
      data: {
        userId: req.userId!,
        description: data.description,
        type: data.type,
        kind: data.kind ?? 'APORTE',
        amount: reaisToCents(data.amount),
        date: parseInvestmentDate(data.date),
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(serializeInvestment(investment));
  }),
);

investmentsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(investmentUpdateSchema, req.body);
    const investment = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!investment) throw new HttpError(404, 'Lançamento não encontrado.');

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        description: data.description,
        type: data.type,
        kind: data.kind,
        amount: data.amount !== undefined ? reaisToCents(data.amount) : undefined,
        date: data.date !== undefined ? parseInvestmentDate(data.date) : undefined,
        notes: data.notes,
      },
    });
    res.json(serializeInvestment(updated));
  }),
);

investmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const investment = await prisma.investment.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!investment) throw new HttpError(404, 'Lançamento não encontrado.');
    await prisma.investment.delete({ where: { id: investment.id } });
    res.status(204).end();
  }),
);
