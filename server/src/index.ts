import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';
import { startTelegramBot, stopTelegramBot } from './telegramBot';
import { startTelegramNotifier, stopTelegramNotifier } from './telegramNotifier';
import { todayIso } from './lib/dates';
import { currentYearMonth } from './lib/month';
import { catchUpRecurringExpenses } from './lib/recurring';

// Permite conexões HTTPS através de proxies com certificado auto-assinado.
// Só liga sob pedido explícito e nunca em produção: sem validação de
// certificado, qualquer MITM lê a chave da API da Anthropic.
if (env.allowInsecureTls && !env.isProduction) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('⚠️  ALLOW_INSECURE_TLS ligado: validação de certificado TLS DESATIVADA (apenas dev).');
} else if (env.allowInsecureTls && env.isProduction) {
  console.warn('⚠️  ALLOW_INSECURE_TLS ignorado: NODE_ENV=production.');
}

/**
 * Gera as despesas fixas que ficaram para trás. Roda no boot e uma vez por
 * dia, para o mês virar sozinho mesmo com o app aberto o tempo todo — e para
 * recuperar meses inteiros se ele ficou desligado.
 */
async function runRecurringCatchUp() {
  try {
    const { year, month } = currentYearMonth();
    const users = await prisma.user.findMany({ select: { id: true } });
    let total = 0;
    for (const u of users) {
      total += await catchUpRecurringExpenses(prisma, u.id, year, month);
    }
    if (total > 0) console.log(`Despesas fixas geradas automaticamente: ${total}`);
  } catch (err) {
    console.error('Falha ao gerar despesas fixas:', err);
  }
}

async function main() {
  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`API rodando em http://localhost:${env.port}`);
    console.log(`Fuso do app (APP_TZ): ${env.appTimeZone} — hoje = ${todayIso()}`);
    console.log(`Lançamento por chat: ${env.chatEnabled ? 'habilitado' : 'desabilitado'}`);
    console.log(`Bot do Telegram: ${env.telegramEnabled ? 'habilitado' : 'desabilitado'}`);
  });

  if (env.telegramEnabled) {
    startTelegramBot().catch((err) => console.error('Bot do Telegram encerrou com erro:', err));
    startTelegramNotifier();
  }

  await runRecurringCatchUp();
  const recurringTimer = setInterval(runRecurringCatchUp, 24 * 60 * 60 * 1000);
  recurringTimer.unref();

  const shutdown = async () => {
    console.log('Encerrando...');
    stopTelegramBot();
    stopTelegramNotifier();
    clearInterval(recurringTimer);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
