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

export interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
}

export interface TelegramPairResult {
  code: string;
  botUsername: string | null;
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

// ============================================================
// Saúde — Treinos
// ============================================================

export type WorkoutKind = 'STRENGTH' | 'CARDIO' | 'MIXED' | 'REST';

export interface WorkoutExercise {
  id: string;
  dayId: string;
  name: string;
  muscleGroup: string | null;
  targetSets: number | null;
  targetReps: string | null;
  order: number;
}

export interface WorkoutDay {
  id: string;
  weekday: number; // 0=Dom ... 6=Sáb
  name: string;
  kind: WorkoutKind;
  exercises: WorkoutExercise[];
}

export interface WorkoutSet {
  id: string;
  sessionId: string;
  exerciseName: string;
  muscleGroup: string | null;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
}

export interface WorkoutSetInput {
  exerciseName: string;
  muscleGroup?: string | null;
  setIndex?: number;
  weightKg?: number | null;
  reps?: number | null;
}

export interface WorkoutSession {
  id: string;
  date: string;
  dayId: string | null;
  title: string;
  kind: WorkoutKind;
  notes: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  sets: WorkoutSet[];
  createdAt: string;
}

export interface WorkoutSessionInput {
  date: string;
  dayId?: string | null;
  title: string;
  kind?: WorkoutKind;
  notes?: string | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  sets?: WorkoutSetInput[];
}

export interface WorkoutToday {
  date: string;
  weekday: number;
  day: WorkoutDay | null;
  session: WorkoutSession | null;
}

export interface WorkoutSummary {
  thisWeekCount: number;
  weekStreak: number;
  totalSessions: number;
  weeks: { weekStart: string; count: number }[];
  volumeByMuscle: { muscle: string; sets: number }[];
  exercises: {
    name: string;
    pr: number;
    lastWeight: number;
    lastDate: string;
    setCount: number;
  }[];
}

export interface ExerciseHistory {
  name: string;
  points: { date: string; maxWeight: number; topReps: number }[];
}

export interface BodyMetric {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFat: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  thighCm: number | null;
  notes: string | null;
}

export interface BodyMetricInput {
  date: string;
  weightKg?: number | null;
  bodyFat?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  hipCm?: number | null;
  thighCm?: number | null;
  notes?: string | null;
}

// ============================================================
// Saúde — Água
// ============================================================

export interface WaterDay {
  date: string;
  goalMl: number;
  consumedMl: number;
  percent: number;
  entries: { id: string; date: string; amountMl: number; createdAt: string }[];
}

export interface WaterHistory {
  goalMl: number;
  days: { date: string; consumedMl: number }[];
}

// ============================================================
// Estudos
// ============================================================

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  done: boolean;
  order: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  order: number;
  topics: Topic[];
  topicCount: number;
  doneCount: number;
  progress: number;
}

export interface Exam {
  id: string;
  subjectId: string | null;
  title: string;
  date: string;
  notes: string | null;
}

export interface StudyTask {
  id: string;
  subjectId: string | null;
  title: string;
  dueDate: string | null;
  done: boolean;
}

export interface StudiesOverview {
  subjects: Subject[];
  upcomingExams: Exam[];
  pendingTasks: StudyTask[];
  totals: {
    subjectCount: number;
    totalTopics: number;
    doneTopics: number;
    overallProgress: number;
    pendingTaskCount: number;
  };
}

export interface IncomeInput {
  description: string;
  amount: number;
  date: string;
  accountId: string | null;
}
