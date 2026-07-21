// Permite conexões HTTPS através de proxies com certificado auto-assinado (dev only).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';
import { startTelegramBot, stopTelegramBot } from './telegramBot';

async function main() {
  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`API rodando em http://localhost:${env.port}`);
    console.log(`Lançamento por chat: ${env.chatEnabled ? 'habilitado' : 'desabilitado'}`);
    console.log(`Bot do Telegram: ${env.telegramEnabled ? 'habilitado' : 'desabilitado'}`);
  });

  if (env.telegramEnabled) {
    startTelegramBot().catch((err) => console.error('Bot do Telegram encerrou com erro:', err));
  }

  const shutdown = async () => {
    console.log('Encerrando...');
    stopTelegramBot();
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
