# 💰 Controle Financeiro

App pessoal de controle financeiro cujo foco é **mostrar de forma clara quanto você ainda pode gastar no mês**, com base no orçamento mensal definido e no total já acumulado na fatura do cartão.

- **Destaque visual**: o número "ainda posso gastar" é o maior elemento da tela, com cores de status (verde / amarelo / vermelho).
- **Lançamentos manuais** de despesas, com edição e exclusão.
- **Lançamento por chat em linguagem natural** (ex.: _"gastei 150 na loja de materiais ontem"_) interpretado pela API da Anthropic (Claude), com **preview para confirmar/editar antes de salvar**.
- **Orçamento por mês** (histórico independente por mês), navegação entre meses e relatório comparativo mês a mês.
- Responsivo (mobile-first) e com **modo escuro automático**.

---

## Stack

| Camada    | Tecnologia                                                            |
| --------- | -------------------------------------------------------------------- |
| Frontend  | React + Vite + TypeScript, React Router                              |
| Backend   | Node.js + Express + TypeScript                                       |
| Banco     | Prisma ORM + SQLite (troca simples para PostgreSQL)                  |
| Auth      | E-mail/senha, senha com **bcrypt**, sessão via **JWT**              |
| IA (chat) | API da Anthropic (Claude) via `@anthropic-ai/sdk` — **só no backend** |
| Testes    | Vitest (regras de cálculo de orçamento)                             |

Estrutura:

```
.
├── server/     # API Express + Prisma + integração Claude
├── client/     # SPA React + Vite
├── docker-compose.yml
└── README.md
```

Todos os valores monetários são armazenados em **centavos (inteiros)** no banco para evitar erros de ponto flutuante; a conversão para reais acontece apenas na borda da API.

---

## Pré-requisitos

- **Node.js 20+** e **npm 10+** (para rodar localmente).  
  _Este projeto foi gerado em uma máquina sem Node instalado — instale a partir de <https://nodejs.org> antes de rodar._
- (Opcional) **Docker + Docker Compose**, para subir tudo com um comando.
- (Opcional) Uma **chave da API da Anthropic** (<https://console.anthropic.com/>) para habilitar o lançamento por chat. Sem ela, o app funciona normalmente, apenas sem o campo de chat.

---

## Rodando localmente (desenvolvimento)

Na raiz do projeto:

```bash
# 1. Instalar dependências (usa npm workspaces — instala server e client)
npm install

# 2. Configurar variáveis do backend
cp server/.env.example server/.env
#   Edite server/.env e defina ao menos JWT_SECRET (gere um valor aleatório):
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   Opcional: ANTHROPIC_API_KEY para habilitar o chat.

# 3. Criar o banco SQLite e as tabelas
npm run prisma:migrate --workspace server        # cria migração inicial + banco
# (na primeira vez ele pedirá um nome para a migração, ex.: "init")

# 4. (Opcional) Popular com dados de exemplo
npm run db:seed --workspace server
#   Cria o login demo -> email: demo@exemplo.com | senha: senha1234
```

Suba os dois serviços (em terminais separados ou usando o script combinado):

```bash
# Terminal 1 — API em http://localhost:4000
npm run dev:server

# Terminal 2 — Frontend em http://localhost:5173
npm run dev:client
```

Ou, em um único comando (Linux/macOS/Git Bash):

```bash
npm run dev
```

Acesse **http://localhost:5173**. O Vite faz proxy de `/api` para o backend automaticamente.

---

## Rodando com Docker Compose

Requer apenas Docker. Na raiz do projeto:

```bash
# (opcional) exporte a chave da Anthropic para habilitar o chat
export ANTHROPIC_API_KEY="sk-ant-..."
export JWT_SECRET="um-segredo-longo-e-aleatorio"

docker compose up --build
```

- Frontend: **http://localhost:8080**
- O nginx do container do frontend faz proxy de `/api` para o backend.
- O banco SQLite é persistido no volume `db-data`.
- O schema é aplicado automaticamente no start (`prisma db push`).

Para parar: `docker compose down` (adicione `-v` para apagar também o banco).

### Backup do banco

Como o SQLite fica num único host (sem replicação), vale fazer backups periódicos do volume:

```powershell
powershell -File scripts/backup-db.ps1
```

Copia `dev.db` do container para `backups/` (timestamped, mantém os 30 mais recentes). Para automatizar, crie uma tarefa no **Agendador de Tarefas do Windows** apontando para esse comando (ex.: diariamente às 3h).

---

## Variáveis de ambiente (backend — `server/.env`)

| Variável            | Obrigatória | Descrição                                                                 |
| ------------------- | ----------- | ------------------------------------------------------------------------- |
| `PORT`              | não (4000)  | Porta HTTP da API.                                                        |
| `DATABASE_URL`      | sim         | Conexão do Prisma. Padrão SQLite: `file:./dev.db`.                        |
| `JWT_SECRET`        | **sim**     | Segredo para assinar os tokens JWT. Use um valor longo e aleatório.       |
| `JWT_EXPIRES_IN`    | não (7d)    | Validade do token (`7d`, `24h`, ...).                                     |
| `ANTHROPIC_API_KEY` | não         | Chave da API da Anthropic (Claude). Ausente = chat em linguagem natural desligado. |
| `CORS_ORIGIN`       | não (\*)    | Origem permitida no CORS (URL do frontend).                               |

> 🔒 A chave da Anthropic fica **apenas no backend**. O frontend nunca a recebe: ele só envia o texto para `/api/chat/parse` e recebe o preview estruturado.

Para trocar para **PostgreSQL**: altere `provider = "postgresql"` em `server/prisma/schema.prisma`, ajuste `DATABASE_URL` e rode `npm run prisma:migrate --workspace server`.

---

## Testes

Testes unitários (regras de cálculo de orçamento) e de integração (rotas HTTP de auth, chat e despesas, via Supertest contra um SQLite de teste dedicado em `server/test/test.db`):

```bash
npm run test --workspace server
```

## Scripts de manutenção

Utilitários administrativos (listar usuários, redefinir senha) em [`server/scripts/`](server/scripts/README.md).

---

## Como o app calcula "quanto ainda posso gastar"

Para o mês selecionado:

```
restante = orçamento_do_mês − soma_das_despesas_do_mês
% usado  = soma_das_despesas / orçamento
status   = verde  (< 80%) | amarelo (80–100%) | vermelho (> 100%)
```

A lógica pura fica em [`server/src/lib/budget.ts`](server/src/lib/budget.ts) e é totalmente coberta por testes.

---

## Principais endpoints da API

Todos sob `/api`. Rotas de dados exigem cabeçalho `Authorization: Bearer <token>`.

| Método | Rota                          | Descrição                                             |
| ------ | ----------------------------- | ----------------------------------------------------- |
| POST   | `/auth/register`              | Cria conta e retorna token.                           |
| POST   | `/auth/login`                 | Autentica e retorna token.                            |
| GET    | `/auth/me`                    | Dados do usuário logado.                              |
| GET    | `/categories`                 | Lista categorias.                                     |
| POST   | `/categories`                 | Cria categoria.                                       |
| PUT    | `/categories/:id`             | Edita categoria.                                      |
| DELETE | `/categories/:id`             | Exclui categoria.                                     |
| GET    | `/budgets/:year/:month`       | Orçamento do mês.                                     |
| PUT    | `/budgets/:year/:month`       | Define/atualiza o orçamento do mês.                   |
| GET    | `/expenses?year=&month=`      | Lançamentos do mês.                                   |
| POST   | `/expenses`                   | Cria lançamento.                                      |
| PUT    | `/expenses/:id`               | Edita lançamento.                                     |
| DELETE | `/expenses/:id`               | Exclui lançamento.                                    |
| GET    | `/summary?year=&month=`       | Resumo do mês (orçamento, gasto, restante, status).   |
| GET    | `/reports/monthly?year=`      | Comparativo mês a mês do ano.                         |
| GET    | `/chat/status`                | Indica se o chat está habilitado (há chave).          |
| POST   | `/chat/parse`                 | Interpreta texto e retorna **preview** (não salva).   |

---

## Escopo desta versão

Incluído: orçamento por mês, categorias, lançamentos manuais, dashboard, navegação entre meses, relatório mês a mês, gasto por categoria e lançamento por chat com confirmação.

Fora do escopo (propositalmente): importação de extratos/CSV/PDF, múltiplos cartões/contas simultâneos, alertas/notificações e módulo de investimentos. O modelo de dados já inclui a base (`Account`) para múltiplos cartões no futuro sem reescrever o restante.
