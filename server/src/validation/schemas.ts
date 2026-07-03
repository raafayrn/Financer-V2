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
