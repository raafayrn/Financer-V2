import { AccountKind, PrismaClient } from '@prisma/client';

export const ACCOUNT_LABELS: Record<AccountKind, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  FOOD_VOUCHER: 'Vale-alimentação',
  WALLET: 'Carteira (Pix)',
};

const DEFAULT_ORDER: AccountKind[] = ['CREDIT_CARD', 'FOOD_VOUCHER', 'WALLET'];

/**
 * Garante que o usuário tenha as 3 contas fixas (cria as que faltarem).
 * Idempotente — chamado no cadastro e sob demanda para contas antigas que
 * ainda não tinham esse conceito.
 */
export async function ensureAccountsForUser(
  prisma: Pick<PrismaClient, 'account'>,
  userId: string,
): Promise<void> {
  for (const kind of DEFAULT_ORDER) {
    await prisma.account.upsert({
      where: { userId_kind: { userId, kind } },
      update: {},
      create: { userId, kind, name: ACCOUNT_LABELS[kind] },
    });
  }
}
