/**
 * Uso pontual: redefine a senha de um usuário existente (para testes locais).
 * Uso: node scripts/set-password.js <email> <nova-senha>
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const [, , email, newPassword] = process.argv;
  if (!email || !newPassword) {
    throw new Error('Uso: node scripts/set-password.js <email> <nova-senha>');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`Senha atualizada para ${user.email}.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
