import type {
  Account,
  AuthResponse,
  Category,
  ChatAskResult,
  ChatImageParseResult,
  ChatMessageResult,
  ChatParseResult,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  Investment,
  InvestmentInput,
  InvestmentSummary,
  MonthlyReport,
  ReportsOverview,
  Summary,
  User,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'cf_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Erro de API com status e mensagem já legível para o usuário. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.');
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (body && (body.error as string)) ||
      (body?.details?.[0]?.message as string) ||
      'Ocorreu um erro.';
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  // Auth
  register: (data: { name: string; email: string; password: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  me: () => request<User>('/auth/me'),

  // Categorias
  listCategories: () => request<Category[]>('/categories'),
  createCategory: (data: { name: string; color?: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: { name?: string; color?: string }) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE' }),

  // Contas fixas (Cartão de crédito / Vale-alimentação / Carteira)
  listAccounts: () => request<Account[]>('/accounts'),

  // Orçamento
  getBudget: (year: number, month: number) =>
    request<{ year: number; month: number; amount: number }>(`/budgets/${year}/${month}`),
  setBudget: (year: number, month: number, amount: number) =>
    request<{ year: number; month: number; amount: number }>(`/budgets/${year}/${month}`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    }),

  // Salário fixo do mês
  getSalary: (year: number, month: number) =>
    request<{ year: number; month: number; amount: number }>(`/salary/${year}/${month}`),
  setSalary: (year: number, month: number, amount: number) =>
    request<{ year: number; month: number; amount: number }>(`/salary/${year}/${month}`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    }),

  // Vale-alimentação (VR) fixo do mês
  getVoucher: (year: number, month: number) =>
    request<{ year: number; month: number; amount: number }>(`/voucher/${year}/${month}`),
  setVoucher: (year: number, month: number, amount: number) =>
    request<{ year: number; month: number; amount: number }>(`/voucher/${year}/${month}`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    }),

  // Saldo base da carteira (Pix) do mês — editável, some com receitas/gastos do mês
  getWalletBase: (year: number, month: number) =>
    request<{ year: number; month: number; amount: number }>(`/wallet-base/${year}/${month}`),
  setWalletBase: (year: number, month: number, amount: number) =>
    request<{ year: number; month: number; amount: number }>(`/wallet-base/${year}/${month}`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    }),

  // Renda avulsa (ex.: vale-alimentação convertido)
  listIncome: (year: number, month: number) =>
    request<Income[]>(`/income?year=${year}&month=${month}`),
  createIncome: (data: IncomeInput) =>
    request<Income>('/income', { method: 'POST', body: JSON.stringify(data) }),
  updateIncome: (id: string, data: Partial<IncomeInput>) =>
    request<Income>(`/income/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIncome: (id: string) => request<void>(`/income/${id}`, { method: 'DELETE' }),

  // Despesas
  listExpenses: (year: number, month: number) =>
    request<Expense[]>(`/expenses?year=${year}&month=${month}`),
  createExpense: (data: ExpenseInput) =>
    request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: Partial<ExpenseInput>) =>
    request<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => request<void>(`/expenses/${id}`, { method: 'DELETE' }),

  // Investimentos
  listInvestments: () => request<Investment[]>('/investments'),
  getInvestmentSummary: (year: number) =>
    request<InvestmentSummary>(`/investments/summary?year=${year}`),
  createInvestment: (data: InvestmentInput) =>
    request<Investment>('/investments', { method: 'POST', body: JSON.stringify(data) }),
  updateInvestment: (id: string, data: Partial<InvestmentInput>) =>
    request<Investment>(`/investments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvestment: (id: string) => request<void>(`/investments/${id}`, { method: 'DELETE' }),

  // Resumo e relatórios
  getSummary: (year: number, month: number) =>
    request<Summary>(`/summary?year=${year}&month=${month}`),
  getMonthlyReport: (year: number) =>
    request<MonthlyReport>(`/reports/monthly?year=${year}`),
  getReportsOverview: (year: number) =>
    request<ReportsOverview>(`/reports/overview?year=${year}`),

  // Chat (linguagem natural / imagem / perguntas)
  chatStatus: () => request<{ enabled: boolean }>('/chat/status'),
  chatParse: (text: string) =>
    request<ChatParseResult>('/chat/parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  chatParseImage: (imageBase64: string, mimeType: string) =>
    request<ChatImageParseResult>('/chat/parse-image', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
  chatParseInvoicePdf: (pdfBase64: string) =>
    request<ChatImageParseResult>('/chat/parse-invoice-pdf', {
      method: 'POST',
      body: JSON.stringify({ pdfBase64 }),
    }),
  chatParseFile: (fileBase64: string, mimeType: string, fileName: string) =>
    request<ChatImageParseResult>('/chat/parse-file', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, mimeType, fileName }),
    }),
  chatAsk: (question: string) =>
    request<ChatAskResult>('/chat/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  chatMessage: (text: string) =>
    request<ChatMessageResult>('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
