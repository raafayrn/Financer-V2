# Backend — Express + Prisma
FROM node:22-slim AS base
WORKDIR /app

# openssl é necessário para o Prisma gerar/rodar o client.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Instala dependências (usa o package.json do server isoladamente).
COPY package.json ./
RUN npm install

# Copia o restante do código e gera o Prisma Client + build TS.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 4000

# Sincroniza o schema com o banco (cria as tabelas se necessário) e sobe a API.
# `prisma db push` é idempotente e não precisa de histórico de migrações — ideal
# para SQLite. Para SQLite, o arquivo do banco fica no volume montado em /app/prisma.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
