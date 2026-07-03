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
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  // O chat em linguagem natural só fica disponível quando há chave configurada.
  get chatEnabled(): boolean {
    return this.geminiApiKey.length > 0;
  },
};
