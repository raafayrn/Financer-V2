import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Copie server/.env.example para server/.env e preencha.`,
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
  // O chat em linguagem natural só fica disponível quando há chave configurada.
  get chatEnabled(): boolean {
    return this.anthropicApiKey.length > 0;
  },
  // O bot do Telegram só liga (polling) quando há token configurado.
  get telegramEnabled(): boolean {
    return this.telegramBotToken.length > 0;
  },
};
