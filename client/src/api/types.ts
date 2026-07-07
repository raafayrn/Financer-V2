export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export type AccountKind = 'CREDIT_CARD' | 'FOOD_VOUCHER' | 'WALLET';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
}

export interface Expense {
  id: string;
  description: string;
  amount: number; // reais
  date: string; // AAAA-MM-DD
  categoryId: string | null;
  accountId: string | null;
  recurring: boolean;
  createdAt: string;
}

export interface Income {
  id: string;
  description: string;
  amount: number; // reais
  date: string; // AAAA-MM-DD
  accountId: string | null;
}

export type BudgetStatus = 'ok' | 'warning' | 'over';

export interface CategorySpent {
  categoryId: string | null;
  categoryName: string;
  color: string;
  spent: number;
}

export interface IncomeSummary {
  salary: number;
  voucher: number;
  extra: number;
  total: number;
}

export interface AccountBreakdown {
  fixed: number;
  variable: number;
  foodVoucher: number;
  wallet: number;
  total: number;
}

export interface Summary {
  year: number;
  month: number;
  budget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetStatus;
  expenseCount: number;
  byCategory: CategorySpent[];
  income: IncomeSummary;
  accounts: AccountBreakdown;
  monthSurplus: number;
  walletBalance: number;
  walletBase: number;
}

export interface MonthlyReport {
  year: number;
  months: { month: number; spent: number; budget: number }[];
}

export interface ReportsOverviewMonth {
  month: number;
  spent: number;
  budget: number;
  income: number;
  fixed: number;
}

export interface ReportsOverviewCategory {
  categoryId: string | null;
  categoryName: string;
  color: string;
  spent: number;
  percent: number;
}

export interface ReportsTopExpense {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoryName: string;
}

export interface ReportsOverview {
  year: number;
  months: ReportsOverviewMonth[];
  byCategory: ReportsOverviewCategory[];
  topExpenses: ReportsTopExpense[];
  totals: {
    spentYear: number;
    incomeYear: number;
    avgMonthlySpent: number;
    savingsRate: number;
    recurringMonthlyAvg: number;
    expenseCount: number;
    monthsOverBudget: number;
  };
}

export interface ChatPreview {
  description: string;
  amount: number;
  date: string;
  categoryId: string | null;
  suggestedCategoryName: string | null;
  recurring: boolean;
}

export interface ChatIncomePreview {
  description: string;
  amount: number;
  date: string;
}

export type ChatParseResult =
  | { ok: true; preview: ChatPreview }
  | { ok: false; message: string };

export type ChatImageParseResult =
  | { ok: true; previews: ChatPreview[] }
  | { ok: false; message: string };

export interface ChatAskResult {
  answer: string;
}

export type ChatMessageResult =
  | { ok: true; intent: 'despesa'; preview: ChatPreview }
  | { ok: true; intent: 'receita'; incomePreview: ChatIncomePreview }
  | { ok: true; intent: 'pergunta'; answer: string }
  | { ok: false; message: string };

export type InvestmentType =
  | 'RENDA_FIXA'
  | 'TESOURO_DIRETO'
  | 'ACOES'
  | 'FUNDOS'
  | 'CRIPTO'
  | 'POUPANCA'
  | 'OUTRO';

export type InvestmentKind = 'APORTE' | 'RESGATE';

export interface Investment {
  id: string;
  description: string;
  type: InvestmentType;
  kind: InvestmentKind;
  amount: number; // reais
  date: string; // AAAA-MM-DD
  notes: string | null;
  createdAt: string;
}

export interface InvestmentInput {
  description: string;
  type: InvestmentType;
  kind: InvestmentKind;
  amount: number;
  date: string;
  notes?: string | null;
}

export interface InvestmentSummary {
  year: number;
  totalBalance: number;
  byType: { type: InvestmentType; amount: number }[];
  months: { month: number; contributed: number; withdrawn: number; net: number }[];
  totals: {
    contributedYear: number;
    withdrawnYear: number;
    netYear: number;
    entryCount: number;
  };
}

export interface ExpenseInput {
  description: string;
  amount: number;
  date: string;
  categoryId: string | null;
  accountId?: string | null;
  recurring: boolean;
}

export interface IncomeInput {
  description: string;
  amount: number;
  date: string;
  accountId: string | null;
}
