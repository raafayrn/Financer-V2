import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';

async function main() {
  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`API rodando em http://localhost:${env.port}`);
    console.log(`Lançamento por chat: ${env.chatEnabled ? 'habilitado' : 'desabilitado'}`);
  });

  const shutdown = async () => {
    console.log('Encerrando...');
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
