/**
 * ============================================================
 * PADRÃO DE ESTADO DE SERVIDOR (TanStack Query v5)
 * ============================================================
 *
 * Toda leitura de API passa por um hook daqui. Nenhuma tela volta a escrever
 * `useEffect` + `Promise.all` + `useState` de loading: esse padrão refazia
 * todas as requisições a cada troca de mês, sem cache, e engolia erro com
 * `.catch(() => null)`.
 *
 * ------------------------------------------------------------
 * 1. Convenção de query key
 * ------------------------------------------------------------
 * A key é `[recurso, ...escopo]`, do mais geral para o mais específico, para
 * que o prefixo funcione como invalidação em lote.
 *
 *   POR MÊS      ['summary', year, month] · ['expenses', y, m] · ['income', y, m]
 *                ['budget', y, m] · ['salary', y, m] · ['voucher', y, m]
 *                ['walletBase', y, m]
 *   POR ANO      ['reports', 'monthly', year] · ['investments', 'summary', year]
 *   POR DIA      ['water', 'day', isoDate]
 *   GLOBAL       ['categories'] · ['accounts'] · ['recurring'] · ['investments']
 *                ['studies', ...] · ['agenda'] · ['ingestions', ...]
 *
 * O que é global é global de verdade no servidor: categorias, contas e
 * templates de fixas não têm recorte de mês — buscá-los de novo a cada troca
 * de mês era desperdício puro. Já `summary`/`expenses`/`income` mudam por mês
 * e entram no cache por mês, então voltar para o mês anterior é instantâneo.
 *
 * `['investments']` é prefixo de `['investments', 'summary', year]` e
 * `['studies']` de todas as abas de estudos — de propósito: invalidar o
 * prefixo alcança o agregado junto com a lista.
 *
 * ------------------------------------------------------------
 * 2. Invalidação por mutação (use SEMPRE os helpers `afterXChange`)
 * ------------------------------------------------------------
 *   gasto (criar/editar/apagar, parcelar, importar fixas)
 *       → ['expenses'], ['summary'], ['reports']
 *   receita            → ['income'], ['summary']
 *   categoria          → ['categories'], ['summary']   (byCategory carrega nome/cor)
 *   fixa (template)    → ['recurring'], ['expenses'], ['summary'], ['reports']
 *   orçamento/salário/VR/base da carteira
 *                      → a key do próprio mês + ['summary']
 *   ingestão confirmada→ ['ingestions'], ['expenses'], ['income'], ['summary']
 *   água               → ['water']
 *   estudos / agenda   → ['studies'] / ['agenda']
 *
 * A invalidação de gasto é pelo PREFIXO, sem year/month: um parcelamento cria
 * despesas em meses futuros e uma fixa pode nascer em outro mês. Invalidar só
 * o mês em exibição deixaria os outros meses mentindo no cache. Invalidar o
 * prefixo é barato — só as queries montadas na tela refazem a requisição.
 *
 * ------------------------------------------------------------
 * 3. Como migrar uma tela (receita de bolo)
 * ------------------------------------------------------------
 *   a. troque cada `api.X()` do `Promise.all` pelo hook equivalente daqui;
 *      se não existir, crie seguindo a convenção acima;
 *   b. `loading` da tela = `isPending` das queries ESSENCIAIS dela (as que, sem
 *      dados, não há o que desenhar). Query secundária que falha mostra erro
 *      no próprio card, não derruba a tela;
 *   c. hooks de mês não recebem argumento: leem o MonthContext. Passe
 *      `{ year, month }` só quando precisar de um mês diferente do selecionado
 *      (ex.: a tendência dos últimos 6 meses no Resumo);
 *   d. mutação NUNCA chama `load()` na mão — usa os helpers de invalidação;
 *   e. erro não vira `null`: ou a tela mostra o erro, ou não é pra ter sido
 *      engolido.
 */

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { useMonth } from '../context/MonthContext';
import type {
  Account,
  AgendaEvent,
  AgendaEventCategory,
  Category,
  Exam,
  ExamInput,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  Ingestion,
  IngestionConfirmInput,
  Investment,
  InvestmentInput,
  RecurringExpense,
  RecurringExpenseInput,
  StudiesOverview,
  StudyTask,
  Subject,
  Summary,
  Topic,
  WaterDay,
  WorkoutSessionInput,
} from './types';

/** Mês explícito; ausente = o mês selecionado no MonthContext. */
export interface MonthArg {
  year: number;
  month: number;
}

export const keys = {
  summary: (year: number, month: number) => ['summary', year, month] as const,
  expenses: (year: number, month: number) => ['expenses', year, month] as const,
  income: (year: number, month: number) => ['income', year, month] as const,
  budget: (year: number, month: number) => ['budget', year, month] as const,
  salary: (year: number, month: number) => ['salary', year, month] as const,
  voucher: (year: number, month: number) => ['voucher', year, month] as const,
  walletBase: (year: number, month: number) => ['walletBase', year, month] as const,
  monthlyReport: (year: number) => ['reports', 'monthly', year] as const,

  categories: () => ['categories'] as const,
  accounts: () => ['accounts'] as const,
  recurring: () => ['recurring'] as const,
  investments: () => ['investments'] as const,
  investmentSummary: (year: number) => ['investments', 'summary', year] as const,

  waterDay: (date: string) => ['water', 'day', date] as const,
  waterHistory: (days: number) => ['water', 'history', days] as const,

  workoutPlan: () => ['workouts', 'plan'] as const,
  workoutToday: () => ['workouts', 'today'] as const,
  workoutSummary: () => ['workouts', 'summary'] as const,
  workoutSessions: (from?: string, to?: string) => ['workouts', 'sessions', from, to] as const,
  exerciseHistory: (name: string) => ['workouts', 'exerciseHistory', name] as const,
  bodyMetrics: () => ['workouts', 'body'] as const,

  studiesOverview: () => ['studies', 'overview'] as const,
  subjects: () => ['studies', 'subjects'] as const,
  exams: () => ['studies', 'exams'] as const,
  studyTasks: () => ['studies', 'tasks'] as const,
  agenda: () => ['agenda'] as const,

  ingestions: (status: 'pending' | 'all') => ['ingestions', status] as const,
  ingestionCount: () => ['ingestions', 'count'] as const,
};

// ============================================================
// Invalidação
// ============================================================
// Prefixo sem year/month: ver o bloco 2 do topo. Não dá `await` em
// `invalidateQueries` dentro de `onSuccess` quando a tela não precisa esperar —
// o refetch acontece em background e os dados antigos seguem na tela.

export function afterExpenseChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['expenses'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
  void qc.invalidateQueries({ queryKey: ['reports'] });
}

export function afterIncomeChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['income'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
}

export function afterCategoryChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['categories'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
}

export function afterRecurringChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['recurring'] });
  afterExpenseChange(qc);
}

export function afterIngestionChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['ingestions'] });
  afterExpenseChange(qc);
  afterIncomeChange(qc);
}

export function afterInvestmentChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['investments'] });
}

export function afterStudiesChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['studies'] });
}

/** Evento de agenda também aparece no agregado de estudos (visão geral). */
export function afterAgendaChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['agenda'] });
  void qc.invalidateQueries({ queryKey: ['studies'] });
}

export function afterWorkoutChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['workouts'] });
}

export function afterWaterChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['water'] });
}

/** Renda fixa / orçamento / base da carteira: muda a key do mês e o resumo. */
export function afterMonthSettingChange(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['budget'] });
  void qc.invalidateQueries({ queryKey: ['salary'] });
  void qc.invalidateQueries({ queryKey: ['voucher'] });
  void qc.invalidateQueries({ queryKey: ['walletBase'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
}

/**
 * O assistente (ChatBox) lança gasto, receita ou os dois de uma vez, e não diz
 * o quê — então invalida os dois lados.
 */
export function useAfterFinanceChange(): () => void {
  const qc = useQueryClient();
  return () => {
    afterExpenseChange(qc);
    afterIncomeChange(qc);
  };
}

// ============================================================
// Queries — por mês
// ============================================================
// `placeholderData: keepPreviousData` é o que faz a troca de mês não piscar:
// os dados do mês anterior ficam na tela (com `isPlaceholderData` ligado) até
// os novos chegarem, em vez de voltar para `undefined` e cair no spinner.

export function useSummary(arg?: MonthArg) {
  const ctx = useMonth();
  const { year, month } = arg ?? ctx;
  return useQuery({
    queryKey: keys.summary(year, month),
    queryFn: () => api.getSummary(year, month),
    placeholderData: keepPreviousData,
  });
}

export function useExpenses(arg?: MonthArg) {
  const ctx = useMonth();
  const { year, month } = arg ?? ctx;
  return useQuery({
    queryKey: keys.expenses(year, month),
    queryFn: () => api.listExpenses(year, month),
    placeholderData: keepPreviousData,
  });
}

export function useIncomes(arg?: MonthArg) {
  const ctx = useMonth();
  const { year, month } = arg ?? ctx;
  return useQuery({
    queryKey: keys.income(year, month),
    queryFn: () => api.listIncome(year, month),
    placeholderData: keepPreviousData,
  });
}

// ============================================================
// Queries — globais
// ============================================================
// Sem `keepPreviousData`: a key não muda, então não há o que preservar.
// `staleTime` próprio e longo em categorias/contas: contas são 3 linhas fixas
// criadas no registro e categorias mudam uma vez por mês, no máximo.

export function useCategories() {
  return useQuery({
    queryKey: keys.categories(),
    queryFn: () => api.listCategories(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts(),
    queryFn: () => api.listAccounts(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useWaterDay(date: string) {
  return useQuery({
    queryKey: keys.waterDay(date),
    queryFn: () => api.getWaterDay(date),
  });
}

export function useStudiesOverview() {
  return useQuery({
    queryKey: keys.studiesOverview(),
    queryFn: () => api.getStudiesOverview(),
  });
}

export function useAgendaEvents() {
  return useQuery({
    queryKey: keys.agenda(),
    queryFn: () => api.listAgendaEvents(),
  });
}

// ============================================================
// Mutações
// ============================================================

/** `'2026-03-08'` cai dentro de (year, month)? */
function isInMonth(isoDate: string, year: number, month: number): boolean {
  return isoDate.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}`;
}

/** Ordem da lista do servidor: data desc, depois criação desc. */
function sortExpenses(list: Expense[]): Expense[] {
  return [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Criar gasto, com inserção otimista na lista do mês.
 *
 * O que é otimista: a LISTA. Inserir uma linha é previsível — a ordenação é
 * conhecida e, se o POST falhar, o rollback devolve exatamente a lista antiga.
 *
 * O que NÃO é otimista, de propósito: o resumo ("ainda posso gastar"). Esse
 * número depende de qual conta pagou, de a despesa ser recorrente e da regra
 * de não descontar a carteira duas vezes — recalculá-lo aqui seria manter uma
 * segunda implementação do cálculo no client, que cedo ou tarde divergiria do
 * servidor. O resumo é invalidado e volta certo em uma requisição.
 *
 * Compra parcelada (installments > 1) e gasto lançado em outro mês também não
 * entram na inserção otimista: geram linhas em meses que não estão na tela.
 */
export function useCreateExpense() {
  const qc = useQueryClient();
  const { year, month } = useMonth();

  return useMutation({
    mutationFn: (input: ExpenseInput) => api.createExpense(input),
    onMutate: async (input) => {
      const single = (input.installments ?? 1) === 1;
      if (!single || !isInMonth(input.date, year, month)) return { key: null };

      const key = keys.expenses(year, month);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Expense[]>(key);

      const optimistic: Expense = {
        id: `optimistic-${crypto.randomUUID()}`,
        description: input.description,
        amount: input.amount,
        date: input.date,
        categoryId: input.categoryId,
        accountId: input.accountId ?? null,
        recurring: input.recurring,
        recurringExpenseId: null,
        installmentGroupId: null,
        installmentNo: null,
        installmentTotal: null,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Expense[]>(key, (old) => sortExpenses([...(old ?? []), optimistic]));

      return { key, previous };
    },
    onError: (_err, _input, context) => {
      if (context?.key) qc.setQueryData(context.key, context.previous);
    },
    // Sempre, inclusive no erro: o servidor é a verdade e a linha otimista tem
    // id falso. O refetch troca a lista inteira pela versão com o id real.
    onSettled: () => afterExpenseChange(qc),
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IncomeInput) => api.createIncome(input),
    onSuccess: () => afterIncomeChange(qc),
  });
}

/**
 * Beber água é o gesto mais repetido do app e o anel precisa responder no
 * toque. Aqui o update otimista vale a pena: consumido + ml e a porcentagem
 * derivada, aritmética que o servidor faz igual — nada da complexidade do
 * resumo financeiro.
 */
export function useAddWaterEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ml, date }: { ml: number; date?: string }) => api.addWaterEntry(ml, date),
    onMutate: async ({ ml, date }) => {
      if (!date) return { key: null };
      const key = keys.waterDay(date);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WaterDay>(key);
      if (previous) {
        const consumedMl = previous.consumedMl + ml;
        qc.setQueryData<WaterDay>(key, {
          ...previous,
          consumedMl,
          percent:
            previous.goalMl > 0 ? Math.min(100, Math.round((consumedMl / previous.goalMl) * 100)) : 0,
        });
      }
      return { key, previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.key) qc.setQueryData(context.key, context.previous);
    },
    onSettled: () => afterWaterChange(qc),
  });
}

/**
 * Fábrica das mutações que não têm nada de especial: chama a API e invalida o
 * que a mudança alcança. Quem precisa de update otimista (ver useCreateExpense)
 * escreve o hook na mão.
 */
function useApiMutation<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  invalidate: (qc: QueryClient) => void,
) {
  const qc = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => invalidate(qc) });
}

// ---------- Finanças: gasto, receita e ajustes do mês ----------

export function useUpdateExpense() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<ExpenseInput> }) => api.updateExpense(id, data),
    afterExpenseChange,
  );
}

export function useDeleteExpense() {
  return useApiMutation(
    ({ id, group = false }: { id: string; group?: boolean }) => api.deleteExpense(id, group),
    afterExpenseChange,
  );
}

export function useClearMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      year,
      month,
      expenseIds,
      incomeIds,
    }: {
      year: number;
      month: number;
      expenseIds: string[];
      incomeIds: string[];
    }) => api.clearMonth(year, month, expenseIds, incomeIds),
    onSuccess: () => {
      afterExpenseChange(qc);
      afterIncomeChange(qc);
    },
  });
}

export function useUpdateIncome() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<IncomeInput> }) => api.updateIncome(id, data),
    afterIncomeChange,
  );
}

export function useDeleteIncome() {
  return useApiMutation((id: string) => api.deleteIncome(id), afterIncomeChange);
}

/** Salário, VR e base da carteira do mês: `null` = não mexer neste campo. */
export function useSaveIncomeSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      year,
      month,
      salary,
      voucher,
      walletBase,
    }: {
      year: number;
      month: number;
      salary: number | null;
      voucher: number | null;
      walletBase: number | null;
    }) => {
      const tasks: Promise<unknown>[] = [];
      if (salary !== null) tasks.push(api.setSalary(year, month, salary));
      if (voucher !== null) tasks.push(api.setVoucher(year, month, voucher));
      if (walletBase !== null) tasks.push(api.setWalletBase(year, month, walletBase));
      await Promise.all(tasks);
    },
    onSuccess: () => afterMonthSettingChange(qc),
  });
}

// ---------- Finanças: tendência dos últimos meses ----------

/** Últimos `n` meses (mais antigo → mais novo) terminando em (year, month). */
export function lastMonths(year: number, month: number, n: number): MonthArg[] {
  const result: MonthArg[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < n; i++) {
    result.unshift({ year: y, month: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return result;
}

export interface TrendPoint {
  year: number;
  month: number;
  spent: number;
}

/**
 * Gasto dos últimos `n` meses. O relatório do servidor é por ANO, então uma
 * janela de 6 meses cruzando o réveillon precisa de dois relatórios — cada um
 * na sua própria key, para o ano anterior (que não muda mais) ficar no cache.
 */
export function useTrend(n = 6): { data: TrendPoint[]; isPending: boolean } {
  const { year, month } = useMonth();
  const wanted = lastMonths(year, month, n);
  const years = Array.from(new Set(wanted.map((w) => w.year)));

  const reports = useQueries({
    queries: years.map((y) => ({
      queryKey: keys.monthlyReport(y),
      queryFn: () => api.getMonthlyReport(y),
    })),
  });

  const spentByKey = new Map<string, number>();
  for (const r of reports) {
    if (!r.data) continue;
    for (const m of r.data.months) spentByKey.set(`${r.data.year}-${m.month}`, m.spent);
  }

  return {
    data: wanted.map((w) => ({
      year: w.year,
      month: w.month,
      spent: spentByKey.get(`${w.year}-${w.month}`) ?? 0,
    })),
    isPending: reports.some((r) => r.isPending),
  };
}

// ---------- Despesas fixas (templates) ----------

export function useRecurring() {
  return useQuery({ queryKey: keys.recurring(), queryFn: () => api.listRecurring() });
}

export function useCreateRecurring() {
  return useApiMutation(
    (data: RecurringExpenseInput) => api.createRecurring(data),
    afterRecurringChange,
  );
}

export function useUpdateRecurring() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<RecurringExpenseInput> }) =>
      api.updateRecurring(id, data),
    afterRecurringChange,
  );
}

export function useDeleteRecurring() {
  return useApiMutation(
    ({ id, deleteGenerated = false }: { id: string; deleteGenerated?: boolean }) =>
      api.deleteRecurring(id, deleteGenerated),
    afterRecurringChange,
  );
}

export function useMaterializeRecurring() {
  return useApiMutation(
    ({ year, month }: MonthArg) => api.materializeRecurring(year, month),
    afterRecurringChange,
  );
}

export function useImportRecurring() {
  return useApiMutation(
    ({ year, month }: MonthArg) => api.importRecurring(year, month),
    afterRecurringChange,
  );
}

// ---------- Investimentos ----------

export function useInvestments() {
  return useQuery({ queryKey: keys.investments(), queryFn: () => api.listInvestments() });
}

export function useInvestmentSummary(year: number) {
  return useQuery({
    queryKey: keys.investmentSummary(year),
    queryFn: () => api.getInvestmentSummary(year),
    placeholderData: keepPreviousData,
  });
}

export function useCreateInvestment() {
  return useApiMutation((data: InvestmentInput) => api.createInvestment(data), afterInvestmentChange);
}

export function useUpdateInvestment() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<InvestmentInput> }) => api.updateInvestment(id, data),
    afterInvestmentChange,
  );
}

export function useDeleteInvestment() {
  return useApiMutation((id: string) => api.deleteInvestment(id), afterInvestmentChange);
}

// ---------- Ingestão automática ----------

export function useIngestions(status: 'pending' | 'all' = 'pending') {
  return useQuery({
    queryKey: keys.ingestions(status),
    queryFn: () => api.listIngestions(status),
  });
}

/**
 * Contador da aba Pendentes. `staleTime: 0` porque a fila enche sozinha (e-mail
 * do banco, atalho do iPhone) — o refetch ao voltar para a aba é justamente o
 * que faz o número aparecer sem recarregar a página.
 */
export function usePendingIngestionCount() {
  return useQuery({
    queryKey: keys.ingestionCount(),
    queryFn: () => api.countPendingIngestions().then((r) => r.pending),
    staleTime: 0,
  });
}

export function useConfirmIngestion() {
  return useApiMutation(
    ({ id, data }: { id: string; data?: IngestionConfirmInput }) =>
      api.confirmIngestion(id, data ?? {}),
    afterIngestionChange,
  );
}

export function useDiscardIngestion() {
  return useApiMutation((id: string) => api.discardIngestion(id), afterIngestionChange);
}

export function useUnmergeIngestion() {
  return useApiMutation((id: string) => api.unmergeIngestion(id), afterIngestionChange);
}

// ---------- Saúde: treinos e água ----------

export function useWorkoutPlan() {
  return useQuery({ queryKey: keys.workoutPlan(), queryFn: () => api.getWorkoutPlan() });
}

export function useWorkoutToday() {
  return useQuery({ queryKey: keys.workoutToday(), queryFn: () => api.getWorkoutToday() });
}

export function useWorkoutSummary() {
  return useQuery({ queryKey: keys.workoutSummary(), queryFn: () => api.getWorkoutSummary() });
}

/** Histórico de um exercício: só busca quando há exercício selecionado. */
export function useExerciseHistory(name: string | null) {
  return useQuery({
    queryKey: keys.exerciseHistory(name ?? ''),
    queryFn: () => api.getExerciseHistory(name!),
    enabled: name !== null,
  });
}

export function useCreateWorkoutSession() {
  return useApiMutation(
    (data: WorkoutSessionInput) => api.createWorkoutSession(data),
    afterWorkoutChange,
  );
}

export function useUpdateWorkoutSession() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<WorkoutSessionInput> }) =>
      api.updateWorkoutSession(id, data),
    afterWorkoutChange,
  );
}

export function useDeleteWorkoutSession() {
  return useApiMutation((id: string) => api.deleteWorkoutSession(id), afterWorkoutChange);
}

export function useSetWaterGoal() {
  return useApiMutation((goalMl: number) => api.setWaterGoal(goalMl), afterWaterChange);
}

export function useResetWaterDay() {
  return useApiMutation((date?: string) => api.resetWaterDay(date), afterWaterChange);
}

// ---------- Estudos ----------

export function useCreateExam() {
  return useApiMutation((data: ExamInput) => api.createExam(data), afterStudiesChange);
}

export function useUpdateExam() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<ExamInput> }) => api.updateExam(id, data),
    afterStudiesChange,
  );
}

export function useDeleteExam() {
  return useApiMutation((id: string) => api.deleteExam(id), afterStudiesChange);
}

export function useCreateStudyTask() {
  return useApiMutation(
    (data: { title: string; dueDate?: string | null; subjectId?: string | null }) =>
      api.createStudyTask(data),
    afterStudiesChange,
  );
}

export function useUpdateStudyTask() {
  return useApiMutation(
    ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ title: string; dueDate: string | null; subjectId: string | null; done: boolean }>;
    }) => api.updateStudyTask(id, data),
    afterStudiesChange,
  );
}

export function useDeleteStudyTask() {
  return useApiMutation((id: string) => api.deleteStudyTask(id), afterStudiesChange);
}

export function useCreateSubject() {
  return useApiMutation(
    (data: { name: string; color?: string }) => api.createSubject(data),
    afterStudiesChange,
  );
}

export function useDeleteSubject() {
  return useApiMutation((id: string) => api.deleteSubject(id), afterStudiesChange);
}

export function useAddTopic() {
  return useApiMutation(
    ({ subjectId, name }: { subjectId: string; name: string }) =>
      api.addTopic(subjectId, { name }),
    afterStudiesChange,
  );
}

export function useUpdateTopic() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<{ name: string; done: boolean; order: number }> }) =>
      api.updateTopic(id, data),
    afterStudiesChange,
  );
}

export function useDeleteTopic() {
  return useApiMutation((id: string) => api.deleteTopic(id), afterStudiesChange);
}

// ---------- Agenda ----------

export interface AgendaEventInput {
  title: string;
  date: string;
  time?: string | null;
  notes?: string | null;
  category?: AgendaEventCategory;
}

export function useCreateAgendaEvent() {
  return useApiMutation((data: AgendaEventInput) => api.createAgendaEvent(data), afterAgendaChange);
}

export function useUpdateAgendaEvent() {
  return useApiMutation(
    ({ id, data }: { id: string; data: Partial<AgendaEventInput> }) =>
      api.updateAgendaEvent(id, data),
    afterAgendaChange,
  );
}

export function useDeleteAgendaEvent() {
  return useApiMutation((id: string) => api.deleteAgendaEvent(id), afterAgendaChange);
}

// Re-export dos tipos que as telas consomem junto com os hooks, para não
// precisarem importar de dois lugares.
export type {
  Account,
  AgendaEvent,
  Category,
  Exam,
  Expense,
  Income,
  Ingestion,
  Investment,
  RecurringExpense,
  StudiesOverview,
  StudyTask,
  Subject,
  Summary,
  Topic,
  WaterDay,
};
