import express from 'express';
import cors from 'cors';
import { env } from './env';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { categoriesRouter } from './routes/categories';
import { budgetsRouter } from './routes/budgets';
import { salaryRouter } from './routes/salary';
import { voucherRouter } from './routes/voucher';
import { walletBaseRouter } from './routes/walletBase';
import { expensesRouter } from './routes/expenses';
import { incomeRouter } from './routes/income';
import { accountsRouter } from './routes/accounts';
import { summaryRouter } from './routes/summary';
import { reportsRouter } from './routes/reports';
import { chatRouter } from './routes/chat';
import { investmentsRouter } from './routes/investments';
import { telegramRouter } from './routes/telegram';
import { workoutsRouter } from './routes/workouts';
import { waterRouter } from './routes/water';
import { studiesRouter } from './routes/studies';
import { agendaRouter } from './routes/agenda';
import { recurringRouter } from './routes/recurring';
import { cleanupRouter } from './routes/cleanup';
import { ingestRouter } from './routes/ingest';
import { ingestTokensRouter } from './routes/ingestTokens';
import { ingestionsRouter } from './routes/ingestions';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  // O limite elevado (fotos de comprovante/faturas em base64) vale SÓ para o
  // chat. As demais rotas recebem JSON pequeno; aceitar 12mb nelas seria só
  // superfície de DoS de graça.
  app.use('/api/chat', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', chatEnabled: env.chatEnabled });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/salary', salaryRouter);
  app.use('/api/voucher', voucherRouter);
  app.use('/api/wallet-base', walletBaseRouter);
  // Antes do expensesRouter: /api/expenses/ingest autentica por token de
  // ingestão, não pelo JWT da sessão que o expensesRouter exige de tudo.
  app.use('/api/expenses', ingestRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/recurring', recurringRouter);
  app.use('/api/income', incomeRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/telegram', telegramRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/water', waterRouter);
  app.use('/api/studies', studiesRouter);
  app.use('/api/agenda', agendaRouter);
  app.use('/api/cleanup', cleanupRouter);
  app.use('/api/ingest-tokens', ingestTokensRouter);
  app.use('/api/ingestions', ingestionsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  app.use(errorHandler);

  return app;
}
