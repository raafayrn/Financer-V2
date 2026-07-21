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
  amount: reais,
  date: isoDate,
  categoryId: z.string().trim().min(1).nullable().optional(),
  accountId: z.string().trim().min(1).nullable().optional(),
  recurring: z.boolean().optional(),
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

export const examCreateSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título da prova.').max(120),
  date: isoDate,
  subjectId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const examUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    date: isoDate,
    subjectId: z.string().trim().min(1).nullable(),
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
