/**
 * Importação única das faturas Nubank de abril, maio e junho/2026 (lidas
 * pelo assistente a partir dos PDFs). Script de uso pontual — não faz parte
 * do produto.
 *
 * Uso: node scripts/import-nubank.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_EMAIL = 'demo@exemplo.com';

const CATEGORIES = [
  { name: 'Alimentação', color: '#ef4444' },
  { name: 'Transporte', color: '#3b82f6' },
  { name: 'Assinaturas', color: '#6366f1' },
  { name: 'Compras', color: '#f59e0b' },
  { name: 'Saúde', color: '#22c55e' },
  { name: 'Lazer', color: '#a855f7' },
  { name: 'Pix/Empréstimos', color: '#ec4899' },
  { name: 'Outros', color: '#14b8a6' },
];

function toCents(reais) {
  return Math.round(reais * 100);
}

// [dia, descrição, valor em reais, categoria, recorrente?]
const APRIL = [
  [3, 'Posto Fl', 340.36, 'Transporte'],
  [4, 'Mercado Capri', 19.5, 'Alimentação'],
  [4, 'Hadoukensushi', 194.7, 'Alimentação'],
  [6, 'Zig*Rhua', 115.2, 'Alimentação'],
  [6, 'Drogaria Catarinense', 35.39, 'Saúde'],
  [7, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [8, 'Apple.com/Bill', 14.9, 'Assinaturas', true],
  [9, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  [9, 'Amazon Prime BR', 19.9, 'Assinaturas', true],
  [10, 'Sabor e Cultura', 24.0, 'Alimentação'],
  [11, 'Pb*Rocinantetres', 235.77, 'Outros'],
  [11, 'Posto Fl', 17.98, 'Transporte'],
  [12, 'Joinville Shopping (estacionamento)', 19.0, 'Transporte'],
  [12, 'Zp*Enigma Discos', 65.0, 'Compras'],
  [12, 'Posto Z21', 143.83, 'Transporte'],
  [15, 'Mercado Livre - Mk4dolmas', 22.55, 'Compras'],
  [17, 'Eriva S Lanchonete', 6.5, 'Alimentação'],
  [18, 'Barbearia', 55.0, 'Lazer'],
  [18, 'Yelumseg (parcela 10)', 379.71, 'Outros'],
  [19, 'Google Youtube', 26.9, 'Assinaturas', true],
  [19, 'iFood Club', 7.95, 'Alimentação', true],
  [20, 'Porto Valente', 157.3, 'Alimentação'],
  [20, 'Ebn*Playstation', 56.72, 'Lazer'],
  [21, 'Fort Atacadista', 9.79, 'Alimentação'],
  [21, 'Otto Cosméticos', 41.69, 'Compras'],
  [21, 'Sua Academia', 99.9, 'Assinaturas', true],
  [23, 'Apple.com/Bill', 19.9, 'Assinaturas', true],
  [24, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  [26, 'Fundinho', 123.3, 'Compras'],
  [27, 'Jim.com*Chens', 22.0, 'Outros'],
  [27, 'Pdvs', 18.0, 'Outros'],
  [27, 'Faciliti Bebidas', 13.0, 'Alimentação'],
  [27, 'Pdvs', 27.0, 'Outros'],
  [28, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [30, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  // Pix parcelado no crédito (com juros)
  [8, 'Pix - Henri Mark Baur', 2.79, 'Pix/Empréstimos'],
  [8, 'Pix - Guilherme Hofmann Leandro', 8.3, 'Pix/Empréstimos'],
  [8, 'Pix - Pedro Benvenutti Polzin', 2.6, 'Pix/Empréstimos'],
  [11, 'Pix - Ricardo Lima Regis', 361.58, 'Pix/Empréstimos'],
  [15, 'Pix - Pedro Benvenutti Polzin', 5.66, 'Pix/Empréstimos'],
  [16, 'Pix - Pedro Benvenutti Polzin', 5.65, 'Pix/Empréstimos'],
  [17, 'Pix - Erick Toller Claudino', 85.2, 'Pix/Empréstimos'],
  [23, 'Pix - Pedro Benvenutti Polzin', 24.32, 'Pix/Empréstimos'],
  [23, 'Pix - Pedro Benvenutti Polzin', 8.16, 'Pix/Empréstimos'],
  [25, 'Pix - Jamile Luiza Aguiar', 30.54, 'Pix/Empréstimos'],
];

const MAY = [
  [1, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [3, 'Comercial Wojtech', 170.0, 'Compras'],
  [3, 'Joinville Shopping (estacionamento)', 19.0, 'Transporte'],
  [3, 'Kalunga Joinville', 59.4, 'Compras'],
  [3, 'Panvel Farmácias', 8.58, 'Saúde'],
  [5, 'Posto Linha Verde', 328.68, 'Transporte'],
  [5, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [6, 'Claude.ai Subscription', 113.64, 'Assinaturas', true],
  [6, 'IOF - Claude.ai Subscription', 3.98, 'Assinaturas'],
  [8, 'Apple.com/Bill', 14.9, 'Assinaturas', true],
  [8, 'Zig*Spe Feimec', 27.0, 'Outros'],
  [9, 'Amazon Prime BR', 19.9, 'Assinaturas', true],
  [9, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [10, 'Lindt Sprüngli Brazil', 97.62, 'Compras'],
  [10, 'Theconcepthouse', 25.0, 'Compras'],
  [11, 'Pb*Rocinantetres', 125.77, 'Outros'],
  [14, 'Eriva S Lanchonete', 12.0, 'Alimentação'],
  [15, 'Pitter Pan', 3.57, 'Alimentação'],
  [15, 'Eriva S Lanchonete', 28.5, 'Alimentação'],
  [16, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [17, 'Farmácia e Drogaria Ni', 29.9, 'Saúde'],
  [17, 'Kimi Sushi e Frutos do Mar', 127.88, 'Alimentação'],
  [19, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [19, 'iFood Club', 7.95, 'Alimentação', true],
  [19, 'Google Youtube', 26.9, 'Assinaturas', true],
  [20, 'Ebn*Playstation', 62.0, 'Lazer'],
  [21, 'Pharma P F Manipulação (parcela 1/2)', 354.0, 'Saúde'],
  [21, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [22, 'Sua Academia', 99.9, 'Assinaturas', true],
  [23, 'Apple.com/Bill', 19.9, 'Assinaturas', true],
  [24, 'Outback Shop Garten', 174.38, 'Alimentação'],
  [24, 'Joinville Shopping (estacionamento)', 19.0, 'Transporte'],
  [25, 'Farmácia Preço Popular', 97.9, 'Saúde'],
  [27, 'Airbnb (parcela 1/2)', 420.75, 'Lazer'],
  [28, 'Amazon (parcela 1/4)', 115.79, 'Compras'],
  [29, 'Eriva S Lanchonete', 15.0, 'Alimentação'],
  [29, 'Posto Fl', 200.0, 'Transporte'],
  [30, 'Ranger Braza', 63.58, 'Alimentação'],
  [30, 'Mp*Autofarol', 48.0, 'Transporte'],
  [30, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  [31, 'Metroville Prime Grill', 6.0, 'Alimentação'],
  // Pix parcelado no crédito
  [8, 'Pix - PagSeguro International', 8.37, 'Pix/Empréstimos'],
  [11, 'Pix - Gustavo Alberton do Canto', 5.68, 'Pix/Empréstimos'],
  [20, 'Pix - Pedro Benvenutti Polzin', 5.63, 'Pix/Empréstimos'],
];

const JUNE = [
  [1, 'Amazon (parcela 2/4)', 115.79, 'Compras'],
  [1, 'Airbnb (parcela 2/2)', 420.75, 'Lazer'],
  [1, 'Restaurante Glória', 117.19, 'Alimentação'],
  [1, 'Pharma P F Manipulação (parcela 2/2)', 354.0, 'Saúde'],
  [4, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  [4, 'Eriva S Lanchonete', 3.5, 'Alimentação'],
  [5, 'Carmel S Pipoca', 24.0, 'Lazer'],
  [5, 'Rodoviária', 25.97, 'Transporte'],
  [5, 'Posto Fl', 165.18, 'Transporte'],
  [6, 'Magicbus', 90.0, 'Transporte'],
  [6, 'IOF - Anthropic Claude Sub', 4.05, 'Assinaturas'],
  [6, 'Tutumi Cia', 4.9, 'Alimentação'],
  [6, 'Anthropic Claude Subscription', 115.65, 'Assinaturas', true],
  [6, 'Zul 3 Créditos', 3.0, 'Transporte'],
  [6, 'Grafitti CMPA', 43.4, 'Outros'],
  [6, 'Testarossa', 174.9, 'Alimentação'],
  [6, 'Panini Forno Forte', 3.62, 'Alimentação'],
  [6, 'Lucky Tabacaria', 88.8, 'Compras'],
  [6, 'Zul 3 Créditos', 3.0, 'Transporte'],
  [6, 'Gastronomia Dube', 88.0, 'Alimentação'],
  [6, 'Zul 3 Créditos', 3.0, 'Transporte'],
  [7, 'Mp*Smartvalet', 25.0, 'Transporte'],
  [7, 'Olga Bar', 170.1, 'Lazer'],
  [7, 'Spot Batel', 45.8, 'Lazer'],
  [7, 'Ena Comércio de Alimentos', 240.0, 'Alimentação'],
  [7, 'Jardim do Bosque', 157.3, 'Alimentação'],
  [7, 'Inditex Brasil (parcela 1/5)', 105.9, 'Compras'],
  [8, 'Bat Estacionamento', 30.0, 'Transporte'],
  [8, 'Apple.com/Bill', 14.9, 'Assinaturas', true],
  [9, 'Amazon Prime BR', 19.9, 'Assinaturas', true],
  [11, 'Pb*Rocinantetres', 125.77, 'Outros'],
  [12, 'Eriva S Lanchonete', 12.0, 'Alimentação'],
  [16, 'Eriva S Lanchonete', 10.0, 'Alimentação'],
  [18, 'Eriva S Lanchonete', 8.5, 'Alimentação'],
  [18, 'Casa das Embalagens', 11.9, 'Compras'],
  [18, 'Posto Linha Verde', 150.0, 'Transporte'],
  [19, 'Google Youtube', 26.9, 'Assinaturas', true],
  [19, 'iFood Club', 7.95, 'Alimentação', true],
  [20, 'Ebn*Playstation', 59.9, 'Lazer'],
  [21, 'Sua Academia', 99.9, 'Assinaturas', true],
  [22, 'Ebn*Playstation (parcela 1/2)', 26.95, 'Lazer'],
  [23, 'Apple.com/Bill', 19.9, 'Assinaturas', true],
  [23, 'Eriva S Lanchonete', 12.0, 'Alimentação'],
  [30, 'Mercado Livre', 118.83, 'Compras'],
  // Pix parcelado no crédito
  [8, 'Pix - Secretaria de Estado da Fazenda', 157.79, 'Pix/Empréstimos'],
  [8, 'Pix - Luciana Nienov de Lima', 125.27, 'Pix/Empréstimos'],
  [15, 'Pix - Pedro Benvenutti Polzin', 2.57, 'Pix/Empréstimos'],
  [23, 'Pix - Noir Francisco Menegatti Sturmer', 8.16, 'Pix/Empréstimos'],
  [25, 'Pix - Noir Francisco Menegatti Sturmer', 8.14, 'Pix/Empréstimos'],
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`Usuário ${USER_EMAIL} não encontrado.`);

  // Cria (ou reaproveita) as categorias.
  const categoryIdByName = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name: c.name } },
      update: { color: c.color },
      create: { userId: user.id, name: c.name, color: c.color },
    });
    categoryIdByName[c.name] = cat.id;
  }

  const months = [
    { year: 2026, month: 4, items: APRIL },
    { year: 2026, month: 5, items: MAY },
    { year: 2026, month: 6, items: JUNE },
  ];

  let created = 0;
  let totalCents = 0;

  for (const { year, month, items } of months) {
    for (const [day, description, amount, categoryName, recurring] of items) {
      const date = new Date(
        Date.UTC(year, month - 1, day, 12, 0, 0),
      );
      const cents = toCents(amount);
      await prisma.expense.create({
        data: {
          userId: user.id,
          description,
          amount: cents,
          date,
          categoryId: categoryIdByName[categoryName] ?? null,
          recurring: Boolean(recurring),
        },
      });
      created += 1;
      totalCents += cents;
    }
  }

  console.log(`Lançamentos criados: ${created}`);
  console.log(`Total: R$ ${(totalCents / 100).toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
