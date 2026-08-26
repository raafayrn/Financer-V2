import type {
  Account,
  AgendaEvent,
  AgendaEventCategory,
  AuthResponse,
  BodyMetric,
  BodyMetricInput,
  Category,
  ChatAskResult,
  ChatImageParseResult,
  ChatMessageResult,
  ChatParseResult,
  Exam,
  ExamInput,
  ExerciseHistory,
  Expense,
  ExpenseInput,
  ExpenseWithPlan,
  Income,
  IncomeInput,
  Ingestion,
  IngestionConfirmInput,
  Investment,
  InvestmentInput,
  InvestmentSummary,
  MonthlyReport,
  RecurringExpense,
  RecurringExpenseInput,
  RecurringImportResult,
  StudiesOverview,
  StudyTask,
  Subject,
  Summary,
  TelegramPairResult,
  TelegramStatus,
  Topic,
  User,
  WaterDay,
  WaterHistory,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSessionInput,
  WorkoutSummary,
  WorkoutToday,
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
  autoLogin: () => request<AuthResponse>('/auth/auto', { method: 'POST' }),
  me: () => request<User>('/auth/me'),

  // Categorias
  listCategories: () => request<Category[]>('/categories'),
  createCategory: (data: { name: string; color?: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: { name?: string; color?: string }) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE' }),

  // Ingestão automática (e-mail do Nubank, atalho do iPhone)
  listIngestions: (status: 'pending' | 'all' = 'pending') =>
    request<{ ingestions: Ingestion[] }>(`/ingestions?status=${status}`).then((r) => r.ingestions),
  countPendingIngestions: () => request<{ pending: number }>('/ingestions/count'),
  confirmIngestion: (id: string, data: IngestionConfirmInput = {}) =>
    request<{ ingestion: Ingestion; expenseId: string | null; incomeId: string | null }>(
      `/ingestions/${id}/confirm`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  discardIngestion: (id: string) =>
    request<{ ingestion: Ingestion }>(`/ingestions/${id}/discard`, { method: 'POST' }),
  unmergeIngestion: (id: string) =>
    request<{ ingestion: Ingestion; restored: number }>(`/ingestions/${id}/unmerge`, {
      method: 'POST',
    }),

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
    request<ExpenseWithPlan>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: Partial<ExpenseInput>) =>
    request<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** `group` apaga o parcelamento inteiro, não só a parcela do mês. */
  deleteExpense: (id: string, group = false) =>
    request<void>(`/expenses/${id}${group ? '?group=1' : ''}`, { method: 'DELETE' }),

  /**
   * Limpa de uma vez os lançamentos marcados de um mês (gastos e/ou receitas).
   * Os ids vão explícitos para apagar exatamente o que a tela mostrou.
   */
  clearMonth: (year: number, month: number, expenseIds: string[], incomeIds: string[]) =>
    request<{ expensesDeleted: number; incomesDeleted: number }>('/cleanup/month', {
      method: 'POST',
      body: JSON.stringify({ year, month, expenseIds, incomeIds }),
    }),

  // Despesas fixas (templates que geram uma despesa por mês sozinhos)
  listRecurring: () => request<RecurringExpense[]>('/recurring'),
  createRecurring: (data: RecurringExpenseInput) =>
    request<RecurringExpense>('/recurring', { method: 'POST', body: JSON.stringify(data) }),
  updateRecurring: (id: string, data: Partial<RecurringExpenseInput>) =>
    request<RecurringExpense>(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** `deleteGenerated` também apaga as despesas já lançadas por este template. */
  deleteRecurring: (id: string, deleteGenerated = false) =>
    request<void>(`/recurring/${id}${deleteGenerated ? '?deleteGenerated=1' : ''}`, {
      method: 'DELETE',
    }),
  /** Lança agora as fixas de um mês (mesmo futuro). Idempotente. */
  materializeRecurring: (year: number, month: number) =>
    request<{ year: number; month: number; createdCount: number; recurringTotal: number }>(
      `/recurring/materialize?year=${year}&month=${month}`,
      { method: 'POST' },
    ),
  importRecurring: (year: number, month: number) =>
    request<RecurringImportResult>(`/recurring/import?year=${year}&month=${month}`, {
      method: 'POST',
    }),

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

  // Integração com Telegram
  getTelegramStatus: () => request<TelegramStatus>('/telegram/status'),
  pairTelegram: () => request<TelegramPairResult>('/telegram/pair', { method: 'POST' }),
  unlinkTelegram: () => request<void>('/telegram/unlink', { method: 'POST' }),

  // ---------- Saúde: Treinos ----------
  getWorkoutPlan: () => request<WorkoutDay[]>('/workouts/plan'),
  setWorkoutDay: (weekday: number, data: { name: string; kind?: string }) =>
    request<WorkoutDay>(`/workouts/plan/${weekday}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkoutDay: (weekday: number) =>
    request<void>(`/workouts/plan/${weekday}`, { method: 'DELETE' }),
  addWorkoutExercise: (
    weekday: number,
    data: { name: string; muscleGroup?: string | null; targetSets?: number | null; targetReps?: string | null },
  ) =>
    request<WorkoutExercise>(`/workouts/plan/${weekday}/exercises`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorkoutExercise: (
    id: string,
    data: Partial<{ name: string; muscleGroup: string | null; targetSets: number | null; targetReps: string | null; order: number }>,
  ) => request<WorkoutExercise>(`/workouts/exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkoutExercise: (id: string) =>
    request<void>(`/workouts/exercises/${id}`, { method: 'DELETE' }),

  getWorkoutToday: () => request<WorkoutToday>('/workouts/today'),
  listWorkoutSessions: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return request<WorkoutSession[]>(`/workouts/sessions${qs ? `?${qs}` : ''}`);
  },
  createWorkoutSession: (data: WorkoutSessionInput) =>
    request<WorkoutSession>('/workouts/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkoutSession: (id: string, data: Partial<WorkoutSessionInput>) =>
    request<WorkoutSession>(`/workouts/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkoutSession: (id: string) =>
    request<void>(`/workouts/sessions/${id}`, { method: 'DELETE' }),

  getWorkoutSummary: () => request<WorkoutSummary>('/workouts/summary'),
  getExerciseHistory: (name: string) =>
    request<ExerciseHistory>(`/workouts/exercises/${encodeURIComponent(name)}/history`),

  listBodyMetrics: () => request<BodyMetric[]>('/workouts/body'),
  upsertBodyMetric: (data: BodyMetricInput) =>
    request<BodyMetric>('/workouts/body', { method: 'PUT', body: JSON.stringify(data) }),
  deleteBodyMetric: (id: string) => request<void>(`/workouts/body/${id}`, { method: 'DELETE' }),

  // ---------- Saúde: Água ----------
  getWaterDay: (date?: string) =>
    request<WaterDay>(`/water/day${date ? `?date=${date}` : ''}`),
  getWaterHistory: (days = 14) => request<WaterHistory>(`/water/history?days=${days}`),
  setWaterGoal: (goalMl: number) =>
    request<{ goalMl: number }>('/water/goal', { method: 'PUT', body: JSON.stringify({ goalMl }) }),
  addWaterEntry: (amountMl: number, date?: string) =>
    request<WaterDay['entries'][number]>('/water/entries', {
      method: 'POST',
      body: JSON.stringify({ amountMl, ...(date ? { date } : {}) }),
    }),
  deleteWaterEntry: (id: string) => request<void>(`/water/entries/${id}`, { method: 'DELETE' }),
  resetWaterDay: (date?: string) =>
    request<void>(`/water/day${date ? `?date=${date}` : ''}`, { method: 'DELETE' }),

  // ---------- Estudos ----------
  getStudiesOverview: () => request<StudiesOverview>('/studies/overview'),
  listSubjects: () => request<Subject[]>('/studies/subjects'),
  createSubject: (data: { name: string; color?: string }) =>
    request<Subject>('/studies/subjects', { method: 'POST', body: JSON.stringify(data) }),
  updateSubject: (id: string, data: Partial<{ name: string; color: string; order: number }>) =>
    request<Subject>(`/studies/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubject: (id: string) => request<void>(`/studies/subjects/${id}`, { method: 'DELETE' }),

  addTopic: (subjectId: string, data: { name: string }) =>
    request<Topic>(`/studies/subjects/${subjectId}/topics`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTopic: (id: string, data: Partial<{ name: string; done: boolean; order: number }>) =>
    request<Topic>(`/studies/topics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTopic: (id: string) => request<void>(`/studies/topics/${id}`, { method: 'DELETE' }),

  listExams: () => request<Exam[]>('/studies/exams'),
  createExam: (data: ExamInput) =>
    request<Exam>('/studies/exams', { method: 'POST', body: JSON.stringify(data) }),
  updateExam: (id: string, data: Partial<ExamInput>) =>
    request<Exam>(`/studies/exams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExam: (id: string) => request<void>(`/studies/exams/${id}`, { method: 'DELETE' }),

  listStudyTasks: () => request<StudyTask[]>('/studies/tasks'),
  createStudyTask: (data: { title: string; dueDate?: string | null; subjectId?: string | null }) =>
    request<StudyTask>('/studies/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateStudyTask: (
    id: string,
    data: Partial<{ title: string; dueDate: string | null; subjectId: string | null; done: boolean }>,
  ) => request<StudyTask>(`/studies/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudyTask: (id: string) => request<void>(`/studies/tasks/${id}`, { method: 'DELETE' }),

  listAgendaEvents: () => request<AgendaEvent[]>('/agenda'),
  createAgendaEvent: (data: {
    title: string;
    date: string;
    time?: string | null;
    notes?: string | null;
    category?: AgendaEventCategory;
  }) => request<AgendaEvent>('/agenda', { method: 'POST', body: JSON.stringify(data) }),
  updateAgendaEvent: (
    id: string,
    data: Partial<{ title: string; date: string; time: string | null; notes: string | null; category: AgendaEventCategory }>,
  ) => request<AgendaEvent>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgendaEvent: (id: string) => request<void>(`/agenda/${id}`, { method: 'DELETE' }),
};
