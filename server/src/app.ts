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
import { walletRouter } from './routes/wallet';
import { summaryRouter } from './routes/summary';
import { reportsRouter } from './routes/reports';
import { chatRouter } from './routes/chat';
import { investmentsRouter } from './routes/investments';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  // Limite elevado para acomodar fotos de comprovantes em base64 no chat.
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', chatEnabled: env.chatEnabled });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/salary', salaryRouter);
  app.use('/api/voucher', voucherRouter);
  app.use('/api/wallet-base', walletBaseRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/income', incomeRouter);
  app.use('/api/accounts', accountsRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/investments', investmentsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  app.use(errorHandler);

  return app;
}
