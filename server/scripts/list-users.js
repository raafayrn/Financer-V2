const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.user
  .findMany({ select: { id: true, email: true, name: true } })
  .then((users) => {
    console.log(JSON.stringify(users, null, 2));
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
