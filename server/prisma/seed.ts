/**
 * Seed opcional: cria um usuário de exemplo com categorias, orçamento e alguns
 * lançamentos no mês corrente. Rode com: npm run db:seed --workspace server
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@exemplo.com';
  const passwordHash = await bcrypt.hash('senha1234', 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Usuário Demo', passwordHash },
  });

  const categoriesData = [
    { name: 'Alimentação', color: '#ef4444' },
    { name: 'Transporte', color: '#3b82f6' },
    { name: 'Lazer', color: '#a855f7' },
    { name: 'Casa/Reforma', color: '#f59e0b' },
  ];

  const categories = [];
  for (const c of categoriesData) {
    const cat = await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name: c.name } },
      update: { color: c.color },
      create: { userId: user.id, name: c.name, color: c.color },
    });
    categories.push(cat);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.monthlyBudget.upsert({
    where: { userId_year_month: { userId: user.id, year, month } },
    update: { amount: 300000 },
    create: { userId: user.id, year, month, amount: 300000 }, // R$ 3.000,00
  });

  const day = (d: number) => new Date(Date.UTC(year, month - 1, d, 12, 0, 0));

  // Evita duplicar lançamentos ao rodar o seed mais de uma vez.
  const existing = await prisma.expense.count({ where: { userId: user.id } });
  if (existing === 0) {
    await prisma.expense.createMany({
      data: [
        { userId: user.id, description: 'Supermercado', amount: 45000, date: day(3), categoryId: categories[0].id, recurring: false },
        { userId: user.id, description: 'Uber', amount: 4500, date: day(5), categoryId: categories[1].id, recurring: false },
        { userId: user.id, description: 'Cinema', amount: 6000, date: day(8), categoryId: categories[2].id, recurring: false },
        { userId: user.id, description: 'Tinta e material', amount: 32000, date: day(10), categoryId: categories[3].id, recurring: false },
        { userId: user.id, description: 'Assinatura streaming', amount: 3990, date: day(1), categoryId: categories[2].id, recurring: true },
      ],
    });
  }

  console.log('Seed concluído.');
  console.log('Login demo -> email: demo@exemplo.com | senha: senha1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
