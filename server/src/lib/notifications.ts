/**
 * Textos dos avisos proativos do bot do Telegram.
 *
 * Tudo aqui é PURO: recebe os dados já lidos do banco e devolve a string (ou
 * null quando não há nada que valha uma mensagem). Assim dá para testar o
 * conteúdo sem tocar na API do Telegram.
 *
 * Regra geral: mensagem que não diz nada não é enviada. Um bot que manda
 * "nada para hoje" todo dia vira ruído e acaba silenciado.
 */

const WEEKDAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Formata reais no padrão brasileiro (R$ 1.234,56). */
export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function monthNamePt(month: number): string {
  return MONTHS_PT[month - 1] ?? String(month);
}

export function weekdayNamePt(weekday: number): string {
  return WEEKDAYS_PT[weekday] ?? '';
}

// ============================================================
// Resumo da manhã
// ============================================================

export interface DigestData {
  name: string;
  /** Data de hoje "AAAA-MM-DD" no fuso do app. */
  todayIso: string;
  weekday: number;
  finance: {
    remaining: number;
    spent: number;
    income: number;
  } | null;
  /** Despesas fixas que vencem hoje ou amanhã. */
  dueSoon: { description: string; amount: number; daysUntil: number }[];
  workout: { name: string; exerciseCount: number; done: boolean } | null;
  /** Provas nos próximos 14 dias. */
  exams: { title: string; daysUntil: number }[];
  /** Tarefas vencidas ou vencendo hoje. */
  lateTasks: { title: string; daysUntil: number }[];
}

/**
 * Bom-dia com o que importa hoje. Devolve null se não houver absolutamente
 * nada a dizer (usuário sem dados nenhum).
 */
export function buildDailyDigest(d: DigestData): string | null {
  const lines: string[] = [];
  const primeiroNome = d.name.split(' ')[0];

  lines.push(`☀️ Bom dia, ${primeiroNome}! ${capitalize(weekdayNamePt(d.weekday))}.`);

  if (d.finance) {
    lines.push('');
    lines.push(`💰 Ainda pode gastar: ${formatBRL(d.finance.remaining)}`);
    lines.push(`   Já gastou ${formatBRL(d.finance.spent)} de ${formatBRL(d.finance.income)} este mês.`);
  }

  if (d.dueSoon.length > 0) {
    lines.push('');
    for (const bill of d.dueSoon) {
      const quando = bill.daysUntil === 0 ? 'vence hoje' : 'vence amanhã';
      lines.push(`📌 ${bill.description} ${quando} — ${formatBRL(bill.amount)}`);
    }
  }

  if (d.workout) {
    lines.push('');
    lines.push(
      d.workout.done
        ? `💪 Treino de hoje (${d.workout.name}) já registrado. Mandou bem.`
        : `💪 Treino de hoje: ${d.workout.name}${d.workout.exerciseCount > 0 ? ` (${d.workout.exerciseCount} exercícios)` : ''}`,
    );
  }

  if (d.exams.length > 0) {
    lines.push('');
    for (const exam of d.exams) {
      const quando =
        exam.daysUntil === 0
          ? 'é HOJE'
          : exam.daysUntil === 1
            ? 'é amanhã'
            : `em ${exam.daysUntil} dias`;
      lines.push(`📚 ${exam.title} ${quando}`);
    }
  }

  if (d.lateTasks.length > 0) {
    lines.push('');
    for (const task of d.lateTasks) {
      const quando =
        task.daysUntil < 0 ? `${Math.abs(task.daysUntil)}d atrasada` : 'entrega hoje';
      lines.push(`⚠️ ${task.title} — ${quando}`);
    }
  }

  // Só a saudação: não vale uma notificação.
  if (lines.length === 1) return null;
  return lines.join('\n');
}

// ============================================================
// Lembrete de água
// ============================================================

export interface WaterReminderData {
  consumedMl: number;
  goalMl: number;
}

/**
 * Cutuca sobre a hidratação no fim do dia. Devolve null quando a meta já foi
 * batida (ou quando não há meta) — nada a lembrar.
 */
export function buildWaterReminder(d: WaterReminderData): string | null {
  if (d.goalMl <= 0) return null;
  if (d.consumedMl >= d.goalMl) return null;

  const faltaMl = d.goalMl - d.consumedMl;
  const percent = Math.round((d.consumedMl / d.goalMl) * 100);
  const falta = faltaMl >= 1000 ? `${(faltaMl / 1000).toFixed(1).replace('.', ',')} L` : `${faltaMl} ml`;

  if (percent === 0) {
    return `💧 Você ainda não registrou água hoje. Meta: ${formatMl(d.goalMl)}.`;
  }
  return `💧 ${percent}% da meta de água. Faltam ${falta} para completar ${formatMl(d.goalMl)}.`;
}

function formatMl(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1).replace('.', ',')} L` : `${ml} ml`;
}

// ============================================================
// Fechamento do mês
// ============================================================

export interface MonthCloseData {
  year: number;
  month: number;
  spent: number;
  income: number;
  /** Mesmo período do mês anterior a esse, para comparação. */
  previousSpent: number | null;
  topCategories: { name: string; spent: number }[];
}

/** Resumo do mês que acabou, disparado no dia 1. */
export function buildMonthClose(d: MonthCloseData): string {
  const lines: string[] = [];
  const saldo = d.income - d.spent;

  lines.push(`📊 Fechamento de ${monthNamePt(d.month)}/${d.year}`);
  lines.push('');
  lines.push(`Renda:  ${formatBRL(d.income)}`);
  lines.push(`Gastos: ${formatBRL(d.spent)}`);
  lines.push(
    saldo >= 0 ? `Sobrou: ${formatBRL(saldo)} 🎉` : `Faltou: ${formatBRL(Math.abs(saldo))} ⚠️`,
  );

  if (d.previousSpent !== null && d.previousSpent > 0) {
    const diff = d.spent - d.previousSpent;
    const percent = Math.round((Math.abs(diff) / d.previousSpent) * 100);
    lines.push('');
    if (diff > 0) {
      lines.push(`Gastou ${percent}% a mais que no mês anterior (${formatBRL(diff)} a mais).`);
    } else if (diff < 0) {
      lines.push(`Gastou ${percent}% a menos que no mês anterior (${formatBRL(-diff)} a menos).`);
    } else {
      lines.push('Gastou exatamente o mesmo que no mês anterior.');
    }
  }

  if (d.topCategories.length > 0) {
    lines.push('');
    lines.push('Onde foi:');
    for (const c of d.topCategories) {
      lines.push(`  ${c.name}: ${formatBRL(c.spent)}`);
    }
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// Agendamento
// ============================================================

/** "HH:MM" -> minutos desde a meia-noite. null se o formato for inválido. */
export function parseHourMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Já passou da hora agendada hoje? O agendador roda a cada minuto e o log de
 * envio garante uma vez só — então basta saber se o horário já chegou, sem
 * precisar acertar o minuto exato (o que perderia o disparo se o servidor
 * estivesse desligado naquele minuto).
 */
export function isDue(nowMinutes: number, scheduledMinutes: number): boolean {
  return nowMinutes >= scheduledMinutes;
}
