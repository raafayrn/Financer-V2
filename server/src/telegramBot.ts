import { prisma } from './prisma';
import { env } from './env';
import { reaisToCents } from './lib/money';
import { currentYearMonth } from './lib/month';
import { buildFinancialContext } from './lib/financialContext';
import { classifyAndParseMessage, answerFinancialQuestion } from './services/claude';
import { consumePairingCode, createPending, takePending } from './lib/telegramPairing';
import {
  getUpdates,
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  type TelegramUpdate,
} from './services/telegram';

/** Mesma conversão usada em routes/expenses.ts e routes/income.ts (AAAA-MM-DD -> 12:00 UTC). */
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

async function findUserByChatId(chatId: number) {
  return prisma.user.findFirst({ where: { telegramChatId: String(chatId) } });
}

async function handlePairing(chatId: number, text: string): Promise<boolean> {
  const code = text.replace('/start', '').trim();
  if (!/^\d{6}$/.test(code)) return false;

  const userId = consumePairingCode(code);
  if (!userId) {
    await sendMessage(chatId, '❌ Código inválido ou expirado. Gere um novo código no app (botão de ajustes → Telegram).');
    return true;
  }

  const alreadyLinked = await findUserByChatId(chatId);
  if (alreadyLinked && alreadyLinked.id !== userId) {
    await prisma.user.update({ where: { id: alreadyLinked.id }, data: { telegramChatId: null } });
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { telegramChatId: String(chatId) } });
  await sendMessage(
    chatId,
    `✅ Conta vinculada, ${user.name}! A partir de agora você pode mandar seus gastos e receitas por aqui, ex.:\n\n"gastei 45 no mercado"\n"recebi 200 de freela"\n\nOu perguntar, ex.: "quanto já gastei esse mês?"`,
  );
  return true;
}

async function handleMessage(chatId: number, text: string) {
  if (text.startsWith('/start') || /^\d{6}$/.test(text.trim())) {
    if (await handlePairing(chatId, text)) return;
  }

  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendMessage(
      chatId,
      'Essa conta do Telegram ainda não está vinculada a nenhum usuário. Abra o app → botão de ajustes → Telegram, gere um código e envie ele aqui.',
    );
    return;
  }

  if (!env.chatEnabled) {
    await sendMessage(chatId, 'Lançamento por mensagem está indisponível no momento (chave de IA não configurada no servidor).');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  let classified;
  try {
    classified = await classifyAndParseMessage(text, categories.map((c) => c.name), today);
  } catch (err) {
    console.error('Telegram: falha ao classificar mensagem:', err);
    await sendMessage(chatId, 'Não consegui processar essa mensagem agora. Tente de novo em instantes.');
    return;
  }

  if (classified.intent === 'despesa') {
    if (classified.valor === null || classified.valor <= 0) {
      await sendMessage(chatId, classified.aviso ?? 'Não consegui identificar o valor. Reformule, ex.: "gastei 50 no mercado".');
      return;
    }
    const category = classified.categoria
      ? categories.find((c) => c.name.toLowerCase() === classified.categoria!.toLowerCase())
      : undefined;
    const id = createPending({
      kind: 'expense',
      userId: user.id,
      description: classified.descricao || text,
      amount: classified.valor,
      date: classified.data,
      categoryId: category?.id ?? null,
    });
    await sendMessage(
      chatId,
      `💸 Despesa: ${classified.descricao || text}\nValor: ${formatBRL(classified.valor)}\nData: ${classified.data}\nCategoria: ${category?.name ?? 'sem categoria'}\n\nConfirmar?`,
      [[{ text: '✅ Confirmar', callback_data: `confirm:${id}` }, { text: '❌ Cancelar', callback_data: `cancel:${id}` }]],
    );
    return;
  }

  if (classified.intent === 'receita') {
    if (classified.valor === null || classified.valor <= 0) {
      await sendMessage(chatId, classified.aviso ?? 'Não consegui identificar o valor. Reformule, ex.: "recebi 200 de freela".');
      return;
    }
    const id = createPending({
      kind: 'income',
      userId: user.id,
      description: classified.descricao || text,
      amount: classified.valor,
      date: classified.data,
    });
    await sendMessage(
      chatId,
      `💰 Receita: ${classified.descricao || text}\nValor: ${formatBRL(classified.valor)}\nData: ${classified.data}\n\nConfirmar?`,
      [[{ text: '✅ Confirmar', callback_data: `confirm:${id}` }, { text: '❌ Cancelar', callback_data: `cancel:${id}` }]],
    );
    return;
  }

  if (classified.intent === 'pergunta') {
    const { year, month } = currentYearMonth();
    const context = await buildFinancialContext(user.id, year, month);
    try {
      const answer = await answerFinancialQuestion(text, context, today);
      await sendMessage(chatId, answer);
    } catch (err) {
      console.error('Telegram: falha ao responder pergunta:', err);
      await sendMessage(chatId, 'Não consegui responder agora. Tente de novo em instantes.');
    }
    return;
  }

  await sendMessage(chatId, classified.aviso ?? 'Não entendi. Descreva um gasto, uma receita, ou pergunte sobre suas finanças.');
}

async function handleCallback(update: NonNullable<TelegramUpdate['callback_query']>) {
  const chatId = update.message?.chat.id;
  const messageId = update.message?.message_id;
  if (chatId === undefined || messageId === undefined || !update.data) return;

  await answerCallbackQuery(update.id);

  const [action, id] = update.data.split(':');
  const item = takePending(id);
  if (!item) {
    await editMessageText(chatId, messageId, 'Esse lançamento expirou. Envie a mensagem de novo.');
    return;
  }

  const user = await findUserByChatId(chatId);
  if (!user || user.id !== item.userId) {
    await editMessageText(chatId, messageId, 'Não foi possível confirmar (conta não vinculada).');
    return;
  }

  if (action === 'cancel') {
    await editMessageText(chatId, messageId, '❌ Cancelado.');
    return;
  }

  if (action === 'confirm') {
    if (item.kind === 'expense') {
      await prisma.expense.create({
        data: {
          userId: user.id,
          description: item.description,
          amount: reaisToCents(item.amount),
          date: parseDate(item.date),
          categoryId: item.categoryId,
          accountId: null,
          recurring: false,
        },
      });
      await editMessageText(chatId, messageId, `✅ Despesa lançada: ${item.description} — ${formatBRL(item.amount)}`);
    } else {
      await prisma.income.create({
        data: {
          userId: user.id,
          description: item.description,
          amount: reaisToCents(item.amount),
          date: parseDate(item.date),
          accountId: null,
        },
      });
      await editMessageText(chatId, messageId, `✅ Receita lançada: ${item.description} — ${formatBRL(item.amount)}`);
    }
  }
}

let running = false;

/** Loop de long polling — roda enquanto o processo estiver vivo. Sem webhook: não exige URL pública. */
export async function startTelegramBot(): Promise<void> {
  if (!env.telegramEnabled || running) return;
  running = true;
  console.log('Bot do Telegram: iniciado (long polling).');

  let offset = 0;
  while (running) {
    let updates: TelegramUpdate[];
    try {
      updates = await getUpdates(offset, 30);
    } catch (err) {
      console.error('Telegram: falha ao buscar atualizações, tentando de novo em 5s:', err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        if (update.message?.text && update.message.chat) {
          await handleMessage(update.message.chat.id, update.message.text.trim());
        } else if (update.callback_query) {
          await handleCallback(update.callback_query);
        }
      } catch (err) {
        console.error('Telegram: erro ao processar atualização:', err);
      }
    }
  }
}

export function stopTelegramBot(): void {
  running = false;
}
