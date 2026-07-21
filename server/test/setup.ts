import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

// Variáveis de ambiente ANTES de qualquer import de src/env ou src/prisma
// (dotenv.config() não sobrescreve variáveis já definidas no processo).
const dbPath = path.resolve(__dirname, 'test.db');
if (existsSync(dbPath)) rmSync(dbPath);

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = 'test-secret-nao-usar-em-producao';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ANTHROPIC_API_KEY = '';
process.env.CORS_ORIGIN = '*';

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});
