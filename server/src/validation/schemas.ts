import { z } from 'zod';

// Reais com no máximo 2 casas decimais, positivo.
const reais = z
  .number({ invalid_type_error: 'Valor deve ser um número.' })
  .positive('Valor deve ser maior que zero.')
  .max(1_000_000_000, 'Valor muito alto.');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data inválida.');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da categoria.').max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser um hex como #6366f1.')
    .optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (data) => data.name !== undefined || data.color !== undefined,
  { message: 'Envie ao menos um campo para atualizar.' },
);

export const budgetUpsertSchema = z.object({
  amount: reais,
});

// Saldo base da carteira: pode ser exatamente 0 (diferente de salário/VR/
// orçamento, que fazem mais sentido sempre positivos).
export const walletBaseUpsertSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Valor deve ser um número.' })
    .min(0, 'Valor não pode ser negativo.')
    .max(1_000_000_000, 'Valor muito alto.'),
});

export const expenseCreateSchema = z.object({
  description: z.string().trim().min(1, 'Informe uma descrição.').max(200),
  // Numa compra parcelada, este é o valor CHEIO da compra — o backend divide.
  amount: reais,
  date: isoDate,
  categoryId: z.string().trim().min(1).nullable().optional(),
  accountId: z.string().trim().min(1).nullable().optional(),
  recurring: z.boolean().optional(),
  // Ausente ou 1 = compra à vista.
  installments: z
    .number({ invalid_type_error: 'Parcelas deve ser um número.' })
    .int('Parcelas deve ser um número inteiro.')
    .min(1, 'Mínimo de 1 parcela.')
    .max(60, 'Máximo de 60 parcelas.')
    .optional(),
});

export const expenseUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: reais,
    date: isoDate,
    categoryId: z.string().trim().min(1).nullable(),
    accountId: z.string().trim().min(1).nullable(),
    recurring: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

export const incomeCreateSchema = z.object({
  description: z.string().trim().min(1, 'Informe uma descrição.').max(200),
  amount: reais,
  date: isoDate,
  accountId: z.string().trim().min(1).nullable().optional(),
});

export const incomeUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: reais,
    date: isoDate,
    accountId: z.string().trim().min(1).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

export const chatParseSchema = z.object({
  text: z.string().trim().min(1, 'Escreva uma mensagem.').max(500),
});

export const chatAskSchema = z.object({
  question: z.string().trim().min(1, 'Escreva uma pergunta.').max(500),
});

export const chatImageSchema = z.object({
  // Imagem em base64 (sem o prefixo data:...;base64,) e o mime type original.
  imageBase64: z.string().min(1, 'Envie uma imagem.'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, 'Escreva uma mensagem.').max(1000),
});

export const chatInvoicePdfSchema = z.object({
  // PDF em base64 (sem o prefixo data:...;base64,).
  pdfBase64: z.string().min(1, 'Envie um arquivo PDF.'),
});

export const investmentTypeSchema = z.enum([
  'RENDA_FIXA',
  'TESOURO_DIRETO',
  'ACOES',
  'FUNDOS',
  'CRIPTO',
  'POUPANCA',
  'OUTRO',
]);

export const investmentKindSchema = z.enum(['APORTE', 'RESGATE']);

export const investmentCreateSchema = z.object({
  description: z.string().trim().min(1, 'Informe uma descrição.').max(200),
  type: investmentTypeSchema,
  kind: investmentKindSchema.optional(),
  amount: reais,
  date: isoDate,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const investmentUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    type: investmentTypeSchema,
    kind: investmentKindSchema,
    amount: reais,
    date: isoDate,
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

export const chatFileSchema = z.object({
  // Arquivo em base64 (sem o prefixo data:...;base64,). Aceita foto,
  // PDF, CSV ou OFX — o tipo é detectado pelo backend.
  fileBase64: z.string().min(1, 'Envie um arquivo.'),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
});

// ============================================================
// Saúde — Treinos
// ============================================================

const workoutKindSchema = z.enum(['STRENGTH', 'CARDIO', 'MIXED', 'REST']);

// Medida física opcional e positiva (peso/carga/medidas), até 1 casa útil.
const positiveNumberOpt = z
  .number({ invalid_type_error: 'Valor deve ser um número.' })
  .positive('Valor deve ser maior que zero.')
  .max(100000, 'Valor muito alto.')
  .nullable()
  .optional();

const positiveIntOpt = z
  .number({ invalid_type_error: 'Valor deve ser um número.' })
  .int('Deve ser um número inteiro.')
  .positive('Deve ser maior que zero.')
  .max(100000)
  .nullable()
  .optional();

// Upsert de um dia do template semanal (weekday vem na URL).
export const workoutDayUpsertSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do treino.').max(80),
  kind: workoutKindSchema.optional(),
});

export const workoutExerciseCreateSchema = z.object({
  name: z.string().trim().min(1, 'Informe o exercício.').max(120),
  muscleGroup: z.string().trim().max(60).nullable().optional(),
  targetSets: positiveIntOpt,
  targetReps: z.string().trim().max(20).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

export const workoutExerciseUpdateSchema = workoutExerciseCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

const workoutSetInputSchema = z.object({
  exerciseName: z.string().trim().min(1, 'Informe o exercício.').max(120),
  muscleGroup: z.string().trim().max(60).nullable().optional(),
  setIndex: z.number().int().min(1).max(100).optional(),
  weightKg: positiveNumberOpt,
  reps: positiveIntOpt,
});

export const workoutSessionCreateSchema = z.object({
  date: isoDate,
  dayId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1, 'Informe um título.').max(120),
  kind: workoutKindSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  durationMin: positiveIntOpt,
  distanceKm: positiveNumberOpt,
  sets: z.array(workoutSetInputSchema).max(200).optional(),
});

export const workoutSessionUpdateSchema = z
  .object({
    date: isoDate,
    dayId: z.string().trim().min(1).nullable(),
    title: z.string().trim().min(1).max(120),
    kind: workoutKindSchema,
    notes: z.string().trim().max(500).nullable(),
    durationMin: positiveIntOpt,
    distanceKm: positiveNumberOpt,
    // Quando presente, substitui todas as séries da sessão.
    sets: z.array(workoutSetInputSchema).max(200),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

export const bodyMetricUpsertSchema = z
  .object({
    date: isoDate,
    weightKg: positiveNumberOpt,
    bodyFat: positiveNumberOpt,
    waistCm: positiveNumberOpt,
    chestCm: positiveNumberOpt,
    armCm: positiveNumberOpt,
    hipCm: positiveNumberOpt,
    thighCm: positiveNumberOpt,
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (d) =>
      d.weightKg != null ||
      d.bodyFat != null ||
      d.waistCm != null ||
      d.chestCm != null ||
      d.armCm != null ||
      d.hipCm != null ||
      d.thighCm != null,
    { message: 'Informe ao menos peso ou uma medida.' },
  );

// ============================================================
// Saúde — Água
// ============================================================

export const waterGoalSchema = z.object({
  goalMl: z
    .number({ invalid_type_error: 'Meta deve ser um número.' })
    .int('Meta deve ser um número inteiro (ml).')
    .min(100, 'Meta muito baixa.')
    .max(20000, 'Meta muito alta.'),
});

export const waterEntryCreateSchema = z.object({
  date: isoDate.optional(),
  amountMl: z
    .number({ invalid_type_error: 'Valor deve ser um número.' })
    .int('Deve ser em ml inteiros.')
    .min(1, 'Valor deve ser maior que zero.')
    .max(10000, 'Valor muito alto.'),
});

// ============================================================
// Estudos
// ============================================================

const hexColorOpt = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser um hex como #007aff.')
  .optional();

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da matéria.').max(80),
  color: hexColorOpt,
  order: z.number().int().min(0).optional(),
});

export const subjectUpdateSchema = subjectCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

export const topicCreateSchema = z.object({
  name: z.string().trim().min(1, 'Informe o assunto.').max(120),
  done: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const topicUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    done: z.boolean(),
    order: z.number().int().min(0),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

// O curso tem 2 bimestres — por isso o teto é 2, e não 4.
const examTerm = z
  .number({ invalid_type_error: 'Bimestre deve ser um número.' })
  .int()
  .min(1, 'Bimestre deve ser 1 ou 2.')
  .max(2, 'Bimestre deve ser 1 ou 2.');

export const examCreateSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título da prova.').max(120),
  date: isoDate,
  subjectId: z.string().trim().min(1).nullable().optional(),
  term: examTerm.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const examUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    date: isoDate,
    subjectId: z.string().trim().min(1).nullable(),
    term: examTerm.nullable(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

export const studyTaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Informe a tarefa.').max(160),
  dueDate: isoDate.nullable().optional(),
  subjectId: z.string().trim().min(1).nullable().optional(),
  done: z.boolean().optional(),
});

export const studyTaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    dueDate: isoDate.nullable(),
    subjectId: z.string().trim().min(1).nullable(),
    done: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

// ============================================================
// Agenda geral
// ============================================================

const agendaEventCategorySchema = z.enum(['CONSULTA', 'EVENTO', 'COMPROMISSO', 'LEMBRETE', 'OUTRO']);

export const agendaEventCreateSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título.').max(160),
  date: isoDate,
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM.')
    .nullable()
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  category: agendaEventCategorySchema.optional(),
});

export const agendaEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    date: isoDate,
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    notes: z.string().trim().max(500).nullable(),
    category: agendaEventCategorySchema,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

// ============================================================
// Despesas fixas (templates recorrentes)
// ============================================================

export const recurringExpenseCreateSchema = z.object({
  description: z.string().trim().min(1, 'Informe uma descrição.').max(200),
  amount: reais,
  dayOfMonth: z
    .number({ invalid_type_error: 'Dia deve ser um número.' })
    .int('Dia deve ser inteiro.')
    .min(1, 'Dia deve ser entre 1 e 31.')
    .max(31, 'Dia deve ser entre 1 e 31.'),
  categoryId: z.string().trim().min(1).nullable().optional(),
  accountId: z.string().trim().min(1).nullable().optional(),
  // Mês em que o template começa a valer. Ausente = mês corrente.
  startYear: z.number().int().min(1970).max(9999).optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  endYear: z.number().int().min(1970).max(9999).nullable().optional(),
  endMonth: z.number().int().min(1).max(12).nullable().optional(),
  active: z.boolean().optional(),
});

export const recurringExpenseUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: reais,
    dayOfMonth: z.number().int().min(1).max(31),
    categoryId: z.string().trim().min(1).nullable(),
    accountId: z.string().trim().min(1).nullable(),
    startYear: z.number().int().min(1970).max(9999),
    startMonth: z.number().int().min(1).max(12),
    endYear: z.number().int().min(1970).max(9999).nullable(),
    endMonth: z.number().int().min(1).max(12).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Envie ao menos um campo.' });

/**
 * Limpeza de lançamentos de um mês. Os ids vêm explícitos (e não um "apague
 * tudo do mês") para que a tela possa limpar tudo ou só o que foi marcado,
 * usando o mesmo caminho — e para que nada que apareceu depois da tela abrir
 * seja apagado sem o usuário ter visto.
 */
export const monthCleanupSchema = z
  .object({
    year: z.number().int().min(1970).max(9999),
    month: z.number().int().min(1).max(12),
    expenseIds: z.array(z.string().trim().min(1)).max(1000),
    incomeIds: z.array(z.string().trim().min(1)).max(1000),
  })
  .refine((d) => d.expenseIds.length > 0 || d.incomeIds.length > 0, {
    message: 'Selecione ao menos um lançamento para limpar.',
  });
