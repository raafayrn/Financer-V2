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

/** Lê uma flag booleana do ambiente ("1"/"true"/"yes" = ligado). */
function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
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
  // Fuso do usuário — define o que é "hoje" (ver lib/dates.ts).
  appTimeZone: process.env.APP_TZ || 'America/Sao_Paulo',
  // Avisos proativos do bot (resumo da manhã, água, fechamento do mês).
  // Horários no fuso do app; vazio desliga aquele aviso específico.
  telegramNotificationsEnabled: flag('TELEGRAM_NOTIFICATIONS', true),
  telegramDigestHour: process.env.TELEGRAM_DIGEST_HOUR ?? '08:00',
  telegramWaterHour: process.env.TELEGRAM_WATER_HOUR ?? '20:00',
  isProduction: process.env.NODE_ENV === 'production',
  // Dados da conta criada sozinha na primeira execução (o app não tem tela de
  // login — ver routes/auth.ts § /auto).
  defaultUserName: process.env.DEFAULT_USER_NAME || 'Rafael',
  defaultUserEmail: (process.env.DEFAULT_USER_EMAIL || 'eu@orbit.local').toLowerCase(),
  /**
   * Desliga a validação de certificado TLS nas chamadas de saída (Anthropic,
   * Telegram). Só para dev atrás de proxy corporativo com certificado
   * auto-assinado — NUNCA em produção: permite MITM na chave da API.
   */
  allowInsecureTls: flag('ALLOW_INSECURE_TLS', false),
  // O chat em linguagem natural só fica disponível quando há chave configurada.
  get chatEnabled(): boolean {
    return this.anthropicApiKey.length > 0;
  },
  // O bot do Telegram só liga (polling) quando há token configurado.
  get telegramEnabled(): boolean {
    return this.telegramBotToken.length > 0;
  },
};
