import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/http';
import { centsToReais } from '../lib/money';
import { todayIso } from '../lib/dates';
import {
  LIMITE_POR_TIPO,
  ordenarELimitar,
  pontuar,
  relevanciaDoTexto,
  valorEmCentavos,
  type SearchHit,
} from '../lib/search';

export const searchRouter = Router();

searchRouter.use(requireAuth);

/** Quanto o banco entrega por tipo antes do ranking. */
const BUSCA_LIMITE_SQL = 25;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * GET /api/search?q=
 *
 * Uma chamada, sete tipos, uma lista ordenada. A decisão de LIKE em vez de
 * FTS5, o critério de ranking entre tipos e os limites estão documentados em
 * lib/search.ts, junto do código puro que os implementa.
 */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const userId = req.userId!;

    // Uma letra casa com tudo e não ajuda ninguém.
    if (q.length < 2) {
      res.json({ query: q, results: [] });
      return;
    }

    const hoje = todayIso();
    const centavos = valorEmCentavos(q);
    // `mode: 'insensitive'` não existe no provider SQLite do Prisma; o LIKE do
    // SQLite já é case-insensitive para ASCII, e o resto do casamento (acento,
    // início de palavra) é resolvido no ranking, com o texto normalizado.
    const contem = { contains: q };

    const [expenses, incomes, recurring, investments, subjects, exams, tasks, events] =
      await Promise.all([
        prisma.expense.findMany({
          where: {
            userId,
            ...(centavos !== null ? { OR: [{ description: contem }, { amount: centavos }] } : { description: contem }),
          },
          include: { category: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.income.findMany({
          where: {
            userId,
            ...(centavos !== null ? { OR: [{ description: contem }, { amount: centavos }] } : { description: contem }),
          },
          orderBy: { date: 'desc' },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.recurringExpense.findMany({
          where: {
            userId,
            ...(centavos !== null ? { OR: [{ description: contem }, { amount: centavos }] } : { description: contem }),
          },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.investment.findMany({
          where: {
            userId,
            ...(centavos !== null ? { OR: [{ description: contem }, { amount: centavos }] } : { description: contem }),
          },
          orderBy: { date: 'desc' },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.subject.findMany({ where: { userId, name: contem }, take: BUSCA_LIMITE_SQL }),
        prisma.exam.findMany({
          where: { userId, title: contem },
          include: { subject: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.studyTask.findMany({
          where: { userId, title: contem },
          include: { subject: { select: { name: true } } },
          take: BUSCA_LIMITE_SQL,
        }),
        prisma.agendaEvent.findMany({
          where: { userId, title: contem },
          orderBy: { date: 'desc' },
          take: BUSCA_LIMITE_SQL,
        }),
      ]);

    const hits: SearchHit[] = [];

    /** Casou pelo valor exato? Então a relevância do texto não pesa contra. */
    const relevancia = (texto: string, valorEmCents?: number) => {
      const porTexto = relevanciaDoTexto(q, texto);
      const porValor = centavos !== null && valorEmCents === centavos ? 0.9 : 0;
      return Math.max(porTexto, porValor);
    };

    for (const e of expenses) {
      const data = iso(e.date);
      hits.push({
        id: e.id,
        kind: 'expense',
        title: e.description,
        subtitle: e.category?.name ?? 'Sem categoria',
        amount: centsToReais(e.amount),
        date: data,
        href: `/financas/lancamentos?year=${e.date.getUTCFullYear()}&month=${e.date.getUTCMonth() + 1}`,
        score: pontuar(relevancia(e.description, e.amount), data, hoje),
      });
    }

    for (const i of incomes) {
      const data = iso(i.date);
      hits.push({
        id: i.id,
        kind: 'income',
        title: i.description,
        subtitle: 'Receita',
        amount: centsToReais(i.amount),
        date: data,
        href: `/financas/lancamentos?year=${i.date.getUTCFullYear()}&month=${i.date.getUTCMonth() + 1}`,
        score: pontuar(relevancia(i.description, i.amount), data, hoje),
      });
    }

    for (const r of recurring) {
      hits.push({
        id: r.id,
        kind: 'recurring',
        title: r.description,
        subtitle: `Fixa · todo dia ${r.dayOfMonth}`,
        amount: centsToReais(r.amount),
        href: '/financas/recorrentes',
        // Fixa não tem data: vale pelo texto, sem bônus nem decaimento.
        score: pontuar(relevancia(r.description, r.amount), null, hoje),
      });
    }

    for (const inv of investments) {
      const data = iso(inv.date);
      hits.push({
        id: inv.id,
        kind: 'investment',
        title: inv.description,
        subtitle: inv.kind === 'RESGATE' ? 'Resgate' : 'Aporte',
        amount: centsToReais(inv.amount),
        date: data,
        href: '/financas/investimentos',
        score: pontuar(relevancia(inv.description, inv.amount), data, hoje),
      });
    }

    for (const s of subjects) {
      hits.push({
        id: s.id,
        kind: 'subject',
        title: s.name,
        subtitle: 'Matéria',
        href: '/estudos/materias',
        score: pontuar(relevancia(s.name), null, hoje),
      });
    }

    for (const ex of exams) {
      const data = iso(ex.date);
      hits.push({
        id: ex.id,
        kind: 'exam',
        title: ex.title,
        subtitle: ex.subject?.name ?? 'Prova',
        date: data,
        href: '/estudos/provas',
        score: pontuar(relevancia(ex.title), data, hoje, 'compromisso'),
      });
    }

    for (const t of tasks) {
      const data = t.dueDate ? iso(t.dueDate) : undefined;
      hits.push({
        id: t.id,
        kind: 'task',
        title: t.title,
        subtitle: t.subject?.name ?? 'Tarefa',
        date: data,
        href: '/estudos/tarefas',
        // Tarefa concluída não é compromisso: vira registro e sai do topo.
        score: pontuar(relevancia(t.title), data, hoje, t.done ? 'registro' : 'compromisso'),
      });
    }

    for (const ev of events) {
      const data = iso(ev.date);
      hits.push({
        id: ev.id,
        kind: 'event',
        title: ev.title,
        subtitle: ev.time ? `Agenda · ${ev.time}` : 'Agenda',
        date: data,
        href: '/agenda',
        score: pontuar(relevancia(ev.title), data, hoje, 'compromisso'),
      });
    }

    res.json({
      query: q,
      limitPerKind: LIMITE_POR_TIPO,
      results: ordenarELimitar(hits.filter((h) => h.score > 0)),
    });
  }),
);
