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
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { useMonth } from '../context/MonthContext';
import type {
  Account,
  AgendaEvent,
  Category,
  Expense,
  ExpenseInput,
  Income,
  IncomeInput,
  StudiesOverview,
  Summary,
  WaterDay,
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

export function useAddWaterEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ml, date }: { ml: number; date?: string }) => api.addWaterEntry(ml, date),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['water'] });
    },
  });
}

// Re-export dos tipos que as telas consomem junto com os hooks, para não
// precisarem importar de dois lugares.
export type { Account, AgendaEvent, Category, Expense, Income, StudiesOverview, Summary, WaterDay };
