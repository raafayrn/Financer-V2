import { env } from '../env';

const API_BASE = 'https://api.telegram.org';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${env.telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API (${method}) falhou: ${data.description ?? res.statusText}`);
  }
  return data.result;
}

/** Long polling: busca atualizações novas desde `offset` (bloqueia até `timeoutSeconds`). */
export function getUpdates(offset: number, timeoutSeconds = 30): Promise<TelegramUpdate[]> {
  return call<TelegramUpdate[]>('getUpdates', { offset, timeout: timeoutSeconds });
}

export function sendMessage(
  chatId: number | string,
  text: string,
  inlineKeyboard?: InlineKeyboardButton[][],
): Promise<{ message_id: number }> {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
  });
}

export function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
): Promise<unknown> {
  return call('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}
