# Offline-first: proposta

Proposta, antes de qualquer código — como o plano pede. Lido sobre
`client/src/registerSW.ts`, `client/vite.config.ts` e `client/src/api/client.ts`.

## De onde partimos

O PWA hoje faz cache **só do shell** (workbox, `globPatterns` de js/css/html/
ícones) e tem uma decisão explícita e correta no `vite.config.ts`:

> `/api` NUNCA é cacheado. Num app de dinheiro, mostrar um saldo velho como se
> fosse o atual é pior do que mostrar a tela de "sem conexão".

Essa frase é o eixo da proposta inteira. Offline-first aqui **não pode**
significar "mostrar número velho fingindo que é atual". Tem que significar
"mostrar número velho DIZENDO que é velho, e deixar você lançar mesmo assim".

## 1. Persistir o cache do TanStack Query

`@tanstack/query-sync-storage-persister` + IndexedDB (não `localStorage`: o
cache do mês inteiro passa fácil dos 5 MB de cota, e `localStorage` é síncrono
na thread principal).

**O que persistir**, e o critério é "isso mudou sozinho enquanto eu estava
fora?":

| Query | Persistir | Por quê |
|---|---|---|
| `expenses`, `income`, `summary` do mês corrente e dos 2 anteriores | sim | é o que você abre |
| `categories`, `accounts` | sim | quase imutáveis |
| `recurring` | sim | muda uma vez por mês |
| `studies`, `agenda` | sim | leitura pura, útil offline |
| `summary` de meses distantes | **não** | infla o cache sem ninguém pedir |
| `search` | **não** | resultado é derivado, refaz em 1 requisição |
| `chat`, `ingestions` | **não** | ver "o que não funciona offline" |

`maxAge` do persister: 7 dias. Passou disso, o cache volta vazio em vez de
mostrar um mês de julho como se fosse setembro.

## 2. Fila de mutações

O TanStack tem `defaultMutationOptions` + `queryClient.resumePausedMutations()`,
e é o caminho: mutação disparada offline fica **pausada**, não falha.

Três peças:

- **`networkMode: 'offlineFirst'`** nas mutações — dispara se houver rede,
  pausa se não houver;
- **persistência da fila** junto do cache, para sobreviver ao fechamento do app;
- **replay em ordem** ao voltar a conexão (`window.addEventListener('online')`
  e no `focus`).

O `mutationFn` precisa ser **reidratável**: uma função não sobrevive ao
`JSON.stringify`. Isso obriga a registrar as mutações por chave
(`setMutationDefaults(['expenses','create'], { mutationFn })`) — mudança
estrutural em `api/queries.ts`, e é o maior custo desta fase.

## 3. Conflito: o registro mudou no servidor enquanto estava na fila

Cenário real: você edita um gasto no celular offline, o mesmo gasto é
confirmado pela ingestão do e-mail no servidor, e depois a fila sobe.

**Proposta: last-write-wins, com aviso — não merge automático.**

O merge automático é tentador e errado aqui: não há como saber, sem perguntar,
se "R$ 55" do celular deve vencer "R$ 57,90" que veio do banco. Então:

1. cada mutação leva o `updatedAt` que o client tinha quando você editou;
2. o servidor compara com o atual. Diferente → responde **409** com as duas
   versões;
3. o client mostra um toast: *"Este gasto mudou no servidor enquanto você
   estava offline"*, com **Manter o meu** / **Usar o do servidor**.

Isso exige `updatedAt` nas respostas (já existe no schema) e o tratamento de
409 nas rotas de update — trabalho pequeno e localizado.

**Exceção deliberada:** criação não conflita. Dois gastos iguais criados nos
dois lados são dois gastos, e o app já tem `lib/ingestDedupe.ts` para o caso de
duplicata vinda da ingestão.

## 4. Como o usuário VÊ que algo está pendente

Silêncio aqui é o pior resultado possível: você lança, some, e não sabe se
entrou.

- **Indicador global** no cabeçalho, junto do sino: *"3 pendentes de
  sincronia"*, com popover listando o que é;
- **Marca na linha**: o lançamento otimista aparece na lista com um ponto ou
  ícone de nuvem, que some quando o servidor confirma;
- **Distinguir de "pendente de confirmação"**: o app JÁ tem uma fila com esse
  nome (a de ingestão). Duas coisas diferentes chamadas "pendente" seria
  confusão garantida. Vocabulário proposto: a de ingestão continua **"Esperando
  confirmação"**; a de rede vira **"Aguardando conexão"**.

## 5. IDs otimistas

O gasto criado offline tem `optimistic-<uuid>` (o `useCreateExpense` de hoje já
faz isso). Quando o servidor devolve o id real:

- `onSuccess` da mutação troca a linha pelo retorno do servidor;
- qualquer mutação enfileirada que referencie o id temporário precisa ser
  **remapeada** antes de subir. Editar e depois apagar o mesmo gasto offline é
  o caso que quebra ingenuidade: sobe a criação, pega o id real, e as duas
  seguintes têm que ser reescritas.

**Simplificação que eu proporia:** enquanto uma criação está na fila, o
registro é **somente leitura** na interface — dá para ver, não dá para editar
nem apagar. Elimina a classe inteira de bug de remapeamento em troca de uma
restrição que quase ninguém vai encostar. Se um dia incomodar, aí sim vale
implementar o remapeamento.

## 6. O que deliberadamente NÃO funciona offline

Dizer isso na interface, não deixar tentar e falhar:

- **Chat com IA** — precisa da API da Anthropic. Botão desabilitado com
  explicação, não erro depois de digitar;
- **Ingestão** — é o servidor que recebe do e-mail/atalho; o celular offline
  não tem o que sincronizar;
- **Busca (⌘K)** — a parte NAVEGAR precisa do servidor. A parte AGIR é local e
  **continua funcionando**, que é justamente o desenho da fase 3;
- **Confirmar pendente** — é decisão que gera lançamento; enfileirar isso
  misturaria as duas filas (ver item 4);
- **Relatórios de outros anos** — leitura de dado não persistido.

## 7. Trade-offs que quero declarados

| Ganho | Custo |
|---|---|
| Lançar gasto no ônibus sem sinal | Fila persistida, mutações registradas por chave, remapeamento de id |
| Ver o mês offline | Cache em IndexedDB, com risco de mostrar dado velho se o aviso falhar |
| App abre instantâneo (cache quente) | Invalidação fica mais sutil: bug de cache agora sobrevive ao reload |

E o custo que não aparece em tabela: **depurar fica mais difícil.** Hoje um F5
resolve qualquer estado estranho. Com cache persistido, não resolve mais — vai
precisar de um "limpar dados locais" nos Ajustes, e ele passa a ser a primeira
pergunta de qualquer problema.

## Ordem de implementação

Uma etapa por vez, cada uma útil sozinha:

1. **Persistência do cache** — ganho imediato (app abre com conteúdo), risco
   baixo, reversível.
2. **Indicador de sincronia** — antes da fila, de propósito: a interface tem
   que saber falar sobre pendência antes de existir pendência.
3. **Fila de mutações** só de criação de gasto/receita — o caso que importa.
4. **Resolução de conflito** — só depois que a fila estiver rodando de verdade.

Parar depois da 3 é um resultado legítimo. As três primeiras entregam quase
todo o valor; a quarta existe para o caso raro.
