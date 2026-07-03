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
}

export interface MonthlyReport {
  year: number;
  months: { month: number; spent: number; budget: number }[];
}

export interface ChatPreview {
  description: string;
  amount: number;
  date: string;
  categoryId: string | null;
  suggestedCategoryName: string | null;
  recurring: boolean;
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
