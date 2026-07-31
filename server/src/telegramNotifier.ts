/**
 * Avisos proativos do bot: o app procura você, em vez de esperar você abrir.
 *
 * Três disparos por dia, no máximo, e só para quem vinculou o Telegram:
 *   - resumo da manhã   (finanças + contas vencendo + treino + provas)
 *   - lembrete de água  (só se a meta ainda não foi batida)
 *   - fechamento do mês (no dia 1, sobre o mês que acabou)
 *
 * O agendador roda a cada minuto, mas quem garante "uma vez por dia" é a
 * tabela NotificationLog, com unique (userId, jobKey, sentDate): a linha é
 * criada ANTES do envio, então nem reinício de servidor nem duas instâncias
 * rodando geram mensagem repetida.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { env } from './env';
import { sendMessage } from './services/telegram';
import { todayIso, parseApiDate } from './lib/dates';
import { currentYearMonth, monthRange } from './lib/month';
import { centsToReais } from './lib/money';
import { computeAccountBreakdown, computeIncomeSummary, type AccountKind } from './lib/budget';
import { effectiveIncomeForMonth } from './lib/fixedIncome';
import { appliesToMonth, dueDateIso } from './lib/recurring';
import {
  buildDailyDigest,
  buildMonthClose,
  buildWaterReminder,
  isDue,
  parseHourMinute,
  type DigestData,
} from './lib/notifications';

const TICK_MS = 60_000;

/**
 * Reserva o envio do dia. Devolve false se já tinha sido enviado — é a
 * unique constraint do banco decidindo, não uma checagem em memória.
 */
async function claim(userId: string, jobKey: string, sentDate: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { userId, jobKey, sentDate } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false; // já enviado hoje
    }
    throw err;
  }
}

/** Desfaz a reserva quando o envio falhou, para tentar de novo no próximo tick. */
async function releaseClaim(userId: string, jobKey: string, sentDate: string): Promise<void> {
  await prisma.notificationLog
    .deleteMany({ where: { userId, jobKey, sentDate } })
    .catch(() => undefined);
}

/** Minutos desde a meia-noite no fuso do app. */
function nowMinutesInAppTz(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.appTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b - a). */
function daysBetween(fromIso: string, toIso: string): number {
  const a = parseApiDate(fromIso).getTime();
  const b = parseApiDate(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ============================================================
// Coleta dos dados
// ============================================================

export async function collectDigest(userId: string, name: string): Promise<DigestData> {
  const today = todayIso();
  const { year, month } = currentYearMonth();
  const { start, end } = monthRange(year, month);
  const todayDate = parseApiDate(today);
  const weekday = todayDate.getUTCDay();

  const [fixedIncome, expenses, incomes, accounts, templates, workoutDay, workoutSession, exams, tasks] =
    await Promise.all([
      effectiveIncomeForMonth(prisma, userId, year, month),
      prisma.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { amount: true, accountId: true, recurring: true },
      }),
      prisma.income.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { amount: true, accountId: true },
      }),
      prisma.account.findMany({ where: { userId } }),
      prisma.recurringExpense.findMany({ where: { userId, active: true } }),
      prisma.workoutDay.findUnique({
        where: { userId_weekday: { userId, weekday } },
        include: { exercises: true },
      }),
      prisma.workoutSession.findFirst({ where: { userId, date: todayDate } }),
      prisma.exam.findMany({
        where: { userId, date: { gte: todayDate } },
        orderBy: { date: 'asc' },
        take: 5,
      }),
      prisma.studyTask.findMany({
        where: { userId, done: false, dueDate: { not: null, lte: todayDate } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);

  const kindById = new Map<string, AccountKind>(accounts.map((a) => [a.id, a.kind]));
  const breakdown = computeAccountBreakdown(expenses, kindById);
  const nonWallet = incomes.filter((i) => (i.accountId ? kindById.get(i.accountId) : undefined) !== 'WALLET');
  const income = computeIncomeSummary(fixedIncome.salary.amount, fixedIncome.voucher.amount, nonWallet);

  // Contas fixas que vencem hoje ou amanhã (o lançamento já entrou no dia 1;
  // isso aqui é só o lembrete de pagar).
  const dueSoon = templates
    .filter((t) => appliesToMonth(t, year, month))
    .map((t) => ({
      description: t.description,
      amount: centsToReais(t.amount),
      daysUntil: daysBetween(today, dueDateIso(year, month, t.dayOfMonth)),
    }))
    .filter((t) => t.daysUntil === 0 || t.daysUntil === 1)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    name,
    todayIso: today,
    weekday,
    finance: {
      remaining: centsToReais(income.total - breakdown.total),
      spent: centsToReais(breakdown.total),
      income: centsToReais(income.total),
    },
    dueSoon,
    workout: workoutDay
      ? {
          name: workoutDay.name,
          exerciseCount: workoutDay.exercises.length,
          done: workoutSession !== null,
        }
      : null,
    exams: exams
      .map((e) => ({ title: e.title, daysUntil: daysBetween(today, e.date.toISOString().slice(0, 10)) }))
      .filter((e) => e.daysUntil <= 14),
    lateTasks: tasks.map((t) => ({
      title: t.title,
      daysUntil: daysBetween(today, t.dueDate!.toISOString().slice(0, 10)),
    })),
  };
}

export async function collectWater(userId: string) {
  const date = parseApiDate(todayIso());
  const [goal, entries] = await Promise.all([
    prisma.waterGoal.findUnique({ where: { userId } }),
    prisma.waterEntry.findMany({ where: { userId, date }, select: { amountMl: true } }),
  ]);
  return {
    goalMl: goal?.goalMl ?? 3000,
    consumedMl: entries.reduce((sum, e) => sum + e.amountMl, 0),
  };
}

/** Gasto e renda de um mês fechado, para o resumo do dia 1. */
async function monthTotals(userId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const [fixedIncome, expenses, incomes, accounts, categories] = await Promise.all([
    effectiveIncomeForMonth(prisma, userId, year, month),
    prisma.expense.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { amount: true, accountId: true, recurring: true, categoryId: true },
    }),
    prisma.income.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { amount: true, accountId: true },
    }),
    prisma.account.findMany({ where: { userId } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  const kindById = new Map<string, AccountKind>(accounts.map((a) => [a.id, a.kind]));
  const breakdown = computeAccountBreakdown(expenses, kindById);
  const nonWallet = incomes.filter((i) => (i.accountId ? kindById.get(i.accountId) : undefined) !== 'WALLET');
  const income = computeIncomeSummary(fixedIncome.salary.amount, fixedIncome.voucher.amount, nonWallet);

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.categoryId ? (nameById.get(e.categoryId) ?? 'Sem categoria') : 'Sem categoria';
    byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount);
  }

  return {
    spent: centsToReais(breakdown.total),
    income: centsToReais(income.total),
    topCategories: Array.from(byCategory.entries())
      .map(([name, cents]) => ({ name, spent: centsToReais(cents) }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3),
    expenseCount: expenses.length,
  };
}

// ============================================================
// Disparo
// ============================================================

/** Envia uma mensagem já reservada; libera a reserva se o envio falhar. */
async function deliver(
  userId: string,
  chatId: string,
  jobKey: string,
  sentDate: string,
  text: string,
): Promise<void> {
  try {
    await sendMessage(chatId, text);
    console.log(`Telegram: "${jobKey}" enviado para ${userId}.`);
  } catch (err) {
    console.error(`Telegram: falha ao enviar "${jobKey}":`, err);
    await releaseClaim(userId, jobKey, sentDate);
  }
}

async function runForUser(user: { id: string; name: string; telegramChatId: string }): Promise<void> {
  const today = todayIso();
  const nowMin = nowMinutesInAppTz();

  const digestAt = parseHourMinute(env.telegramDigestHour);
  const waterAt = parseHourMinute(env.telegramWaterHour);

  // --- Resumo da manhã ---
  if (digestAt !== null && isDue(nowMin, digestAt)) {
    if (await claim(user.id, 'daily-digest', today)) {
      const text = buildDailyDigest(await collectDigest(user.id, user.name));
      // Nada relevante hoje: mantém a reserva para não recalcular a cada minuto.
      if (text) await deliver(user.id, user.telegramChatId, 'daily-digest', today, text);
    }
  }

  // --- Fechamento do mês (dia 1, junto com o resumo da manhã) ---
  if (digestAt !== null && isDue(nowMin, digestAt) && today.endsWith('-01')) {
    if (await claim(user.id, 'month-close', today)) {
      const { year, month } = currentYearMonth();
      const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
      const beforePrev = prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 };

      const [totals, previous] = await Promise.all([
        monthTotals(user.id, prev.year, prev.month),
        monthTotals(user.id, beforePrev.year, beforePrev.month),
      ]);

      // Mês sem nenhum lançamento não rende resumo.
      if (totals.expenseCount > 0) {
        const text = buildMonthClose({
          year: prev.year,
          month: prev.month,
          spent: totals.spent,
          income: totals.income,
          previousSpent: previous.expenseCount > 0 ? previous.spent : null,
          topCategories: totals.topCategories,
        });
        await deliver(user.id, user.telegramChatId, 'month-close', today, text);
      }
    }
  }

  // --- Lembrete de água ---
  if (waterAt !== null && isDue(nowMin, waterAt)) {
    if (await claim(user.id, 'water-reminder', today)) {
      const text = buildWaterReminder(await collectWater(user.id));
      if (text) await deliver(user.id, user.telegramChatId, 'water-reminder', today, text);
    }
  }
}

async function tick(): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { id: true, name: true, telegramChatId: true },
    });
    for (const u of users) {
      await runForUser({ id: u.id, name: u.name, telegramChatId: u.telegramChatId! });
    }
  } catch (err) {
    console.error('Telegram: erro no ciclo de avisos:', err);
  }
}

let timer: NodeJS.Timeout | null = null;

/** Liga os avisos proativos (no-op quando o bot ou os avisos estão desligados). */
export function startTelegramNotifier(): void {
  if (!env.telegramEnabled || !env.telegramNotificationsEnabled || timer) return;

  console.log(
    `Avisos do Telegram: ligados (resumo ${env.telegramDigestHour}, água ${env.telegramWaterHour}, fuso ${env.appTimeZone}).`,
  );
  void tick();
  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
}

export function stopTelegramNotifier(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Envia o resumo agora, ignorando horário e log — usado pelo comando /resumo. */
export async function sendDigestNow(userId: string, name: string, chatId: string): Promise<void> {
  const text = buildDailyDigest(await collectDigest(userId, name));
  await sendMessage(chatId, text ?? 'Nada para relatar hoje — sem dados suficientes ainda.');
}
