# Modelo de ameaça do Orbit

Relatório, sem alterar nada. Lido em 10/09/2026 sobre `server/src/auth/*`,
`server/src/app.ts`, `client/src/context/AuthContext.tsx`,
`client/src/api/client.ts`, `docker-compose.yml` e `client/nginx.conf`.

## O que o app é

Um planner pessoal de um usuário só. Não tem tela de login: `POST /auth/auto`
devolve um JWT para o primeiro usuário do banco, criando-o se não existir. O
token vive em `localStorage` e vale 7 dias.

Isso significa uma coisa só, e ela é a base de tudo abaixo:

> **Quem alcança a porta do app entra na sua conta.** Não existe credencial a
> roubar porque não existe credencial. A fronteira de segurança é a REDE, não
> a aplicação.

O `docker-compose.yml` já diz isso, e diz bem: o comentário do `BIND_ADDR`
explica que o padrão `0.0.0.0` aceita qualquer interface e recomenda restringir
ao Tailscale ou ao loopback. A arquitetura é coerente com a decisão.

---

## Se roda só em rede local (ou Tailscale): o que é aceitável

**Tudo isso é aceitável, e mudar seria trabalho sem retorno:**

- **Auto-login sem senha.** A ameaça seria alguém na sua rede doméstica com
  intenção de ler seus gastos. Se esse é o cenário, senha no app é o menor dos
  problemas.
- **JWT em `localStorage`.** O risco clássico é XSS ler o token. Mas se há XSS,
  o atacante já está executando código na sua sessão — o token é redundante.
  Cookie `httpOnly` só ajuda de verdade quando existem várias contas e sessões
  para proteger umas das outras.
- **Sem HTTPS entre celular e servidor**, se estiver em Tailscale (que já
  cifra) ou numa rede doméstica que você controla.
- **Sem CSRF token.** A API só aceita JSON e não usa cookie de sessão, então
  não há requisição autenticada por ambiente que um site terceiro consiga
  disparar.

**Duas coisas que eu ajustaria mesmo em rede local**, porque são baratas:

1. `CORS_ORIGIN: "*"` no `docker-compose.yml`. Com `origin: true` o Express
   ecoa qualquer origem. Como não há cookie, o impacto real é baixo — mas o
   custo de listar a origem certa é uma linha.
2. O JWT de 7 dias renova apenas quando expira, e o auto-login recria a sessão
   sem qualquer verificação. Está correto para o modelo; só vale saber que
   **revogar um token vazado é impossível hoje** — não há blocklist nem
   `tokenVersion` no usuário.

---

## Se for exposto à internet: em ordem de prioridade

### 1. Não exponha. Coloque atrás de Tailscale ou VPN.

Não é evasiva — é a resposta certa para este app. Todo o resto desta lista é
mitigação para uma decisão que continua ruim: um app sem tela de login, com
auto-login para o primeiro usuário do banco, na internet aberta, é uma conta
pública com os seus dados financeiros dentro.

### 2. Se for expor mesmo assim, o auto-login tem que morrer primeiro

`POST /auth/auto` não pede nada e devolve um JWT válido. Exposta, essa rota é
a porta aberta. Antes de qualquer outra medida:

- desligar `/auth/auto` por variável de ambiente em produção;
- ativar login por senha (o `passwordHash` já existe no schema, e o comentário
  em `routes/auth.ts` diz que a senha aleatória inicial existe justamente para
  isso);
- adicionar segundo fator, se os dados importam.

### 3. HTTPS obrigatório e headers de segurança

`client/nginx.conf` hoje tem `listen 80` e **nenhum `add_header`**. Faltam:

- TLS (Let's Encrypt) com redirecionamento de 80 para 443;
- `Strict-Transport-Security`;
- `Content-Security-Policy` — a mais trabalhosa e a que mais protege;
- `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`.

No Express, `helmet` **não está instalado**. Uma linha resolve a maior parte.

### 4. Rate limit no que hoje não tem

Estado atual, medido:

| Rota | Limite | Avaliação |
|---|---|---|
| `/api/auth/login` | 20 / 15 min, só falhas | bom |
| `/api/chat/*` | 20 / min por usuário | bom — protege a conta paga da Anthropic |
| `/api/expenses/ingest` | 30 / min | bom |
| **`/auth/auto`** | **nenhum** | cria usuário e emite JWT sem limite |
| **todo o resto** | **nenhum** | inclusive a busca, que faz 8 queries |

Exposto, eu poria um limite global modesto e um específico em `/auth/auto`.

### 5. Corpo de 12 MB no chat

`/api/chat` aceita 12 MB (fotos de comprovante em base64) e tem rate limit por
usuário — mas o rate limit roda **depois** do parse do corpo. Exposto, isso é
memória gratuita para um atacante. Inverter a ordem (limitar antes de parsear)
é barato.

---

## As rotas de ingestão, que aceitam token próprio

Foi o que o plano pediu para olhar com atenção, e é a parte mais bem resolvida
do app.

**O que está certo, e é raro estar:**

- token de 32 bytes aleatórios (`randomBytes(32)`), entropia alta;
- **só o hash SHA-256 vai para o banco** — o valor em claro existe uma vez, na
  criação;
- comparação em **tempo constante** (`timingSafeEqual`), com checagem de
  tamanho antes;
- o comentário explica por que SHA-256 e não bcrypt: o segredo é aleatório, não
  adivinhável, então o custo do bcrypt por requisição não compraria nada. O
  raciocínio está correto;
- **escopo mínimo**: o token vale só para a rota de ingestão, não abre o resto
  do app;
- revogável individualmente, e a linha revogada continua na lista (dá para
  responder "esse canal ainda roda?");
- rate limit de 30/min, com a justificativa certa: um humano não paga com o
  cartão centenas de vezes por hora;
- **nada entra direto como despesa** — tudo vira pendente e espera confirmação.
  É o que impede um token vazado de mexer no "ainda posso gastar".

**O que eu olharia:**

- o token vai no header, mas o Atalhos do iPhone guarda a URL completa no
  aparelho; se o atalho for compartilhado, o token vai junto. Não é falha do
  servidor, é operacional — vale saber;
- não há expiração automática. Um token esquecido vale para sempre até ser
  revogado à mão;
- o rate limit é por IP (padrão do `express-rate-limit`), não por token. Vários
  tokens atrás do mesmo NAT dividem a mesma cota, e um atacante com IPs
  diferentes tem cota nova a cada IP. Chavear por token seria mais preciso.

---

## Validação nas rotas

Todas as rotas que recebem corpo passam por `parseBody(schema)` com zod
(`server/src/validation/schemas.ts`). Não achei nenhuma que confie no corpo cru.
`year`/`month` são validados por `isValidYearMonth` (faixa 1970–9999, 1–12). O
Prisma parametriza tudo — não há SQL montado por concatenação em lugar nenhum,
inclusive na busca nova, que usa `contains` do Prisma.

## Resumo

| Cenário | Veredito |
|---|---|
| Rede local / Tailscale | **Aceitável como está.** Ajustaria só o `CORS_ORIGIN: "*"`. |
| Internet aberta | **Não exponha.** Se expuser: matar o auto-login, senha, HTTPS + headers, rate limit global, e limitar o corpo antes de parsear. |

Nada aqui é urgente no uso atual. A coisa mais importante do documento é a
primeira frase da seção 2: a fronteira é a rede, e ela está bem escolhida.
