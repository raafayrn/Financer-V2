# Motor de insights: detectores e limiares

Desenho, antes de implementar — como o plano pede. Lido sobre
`server/src/services/claude.ts`, `server/src/lib/financialContext.ts` e
`server/src/routes/summary.ts`.

## O princípio

**A parte determinística é código; o modelo só escreve o texto final.**

Isso não é preferência de estilo. Um número inventado num app de dinheiro é
pior do que não ter insight nenhum: destrói a confiança em todos os outros
números da tela, inclusive os certos. Então:

- o detector calcula e devolve **valores**;
- a camada Claude recebe os valores prontos e escreve 2–3 frases;
- **todo número no texto tem que existir no insight detectado.** O que não veio
  do detector não pode aparecer.

Validação antes de mostrar: extrair os números do texto gerado e conferir
contra os do detector. Divergiu, cai no texto padrão do próprio detector, que
já é escrito e correto — só menos fluido.

---

## Os cinco detectores

Todos puros, em `server/src/lib/insights.ts`, testáveis sem banco. A rota junta
os dados e chama.

### 1. Categoria acima da média móvel

**Dispara quando:** o gasto da categoria no mês corrente passa de **1,4×** a
média dos **3 meses anteriores**, e a diferença absoluta é de pelo menos
**R$ 100**.

**Por que esses números:**
- 3 meses, não 6: o app tem meses de histórico, não anos. Média de 6 puxaria
  meses vazios do começo do uso para dentro da conta.
- 1,4× e não 1,2×: gasto pessoal varia sozinho. Abaixo de 40% acima da média o
  alerta vira ruído, e insight ruidoso é ignorado — inclusive quando importa.
- O piso de R$ 100 mata o falso positivo aritmético: R$ 12 contra média de
  R$ 5 é 2,4×, e não é notícia nenhuma.

**Precisa de:** pelo menos 2 dos 3 meses anteriores com gasto na categoria.
Sem isso não há média, há um número solto.

### 2. Projeção de fechamento do mês

**Dispara quando:** no ritmo atual, o mês fecha acima da renda disponível.

**Cálculo:** `gastoAteAgora / diaAtual × diasDoMes`, comparado com
`income.total + walletBalance` (o mesmo "disponível" que o `summary` já usa —
reaproveitar é obrigatório, senão o dashboard e o insight discordam).

**Só a partir do dia 8.** Antes disso a projeção é fantasia: um mercado grande
no dia 3 projeta um mês catastrófico que não vai acontecer.

**Não dispara** quando as despesas fixas do mês já foram materializadas e
representam a maior parte do gasto — senão todo dia 1 o app anuncia falência,
porque a fatura inteira entra de uma vez. Este é o detalhe que mais me
preocupa, e vem direto de como `ensureRecurringForMonth` funciona: **projetar
só o gasto variável** e somar as fixas separadamente, que já são conhecidas.

### 3. Recorrente que mudou de valor

**Dispara quando:** a despesa gerada por um template neste mês difere do valor
do template, ou o template mudou desde o mês passado.

**Sem limiar percentual, mas com piso de R$ 1** — reajuste de streaming é de
poucos reais e é exatamente o que passa despercebido. É o detector mais barato
e provavelmente o mais útil: ninguém percebe que a mensalidade subiu R$ 4.

### 4. Parcelamento terminando

**Dispara quando:** um `installmentGroupId` tem a última parcela no mês
corrente ou no próximo.

**O texto é sobre o mês que vem, não sobre o passado:** "a partir de novembro
sobram R$ 360 por mês". É a única notícia boa da lista, e é acionável — dá para
decidir o que fazer com o dinheiro antes de ele evaporar.

### 5. Prova/tarefa próxima cruzada com a agenda

**Dispara quando:** existe prova em até **7 dias** e, nos dias entre hoje e ela,
a agenda tem 2 ou mais compromissos.

**Por que 7 dias:** é a janela em que ainda dá para reorganizar. Com 20 dias o
aviso não é acionável; com 2, é tarde.

**O insight não é "você tem prova"** — isso o dashboard já mostra. É "os dias
antes dela estão cheios", que é o cruzamento que nenhuma tela faz hoje.

---

## Prioridade entre insights

No máximo **2 visíveis por vez** (o plano já define isso na 6.2). A ordem:

1. Projeção estourando a renda — é dinheiro que ainda dá para não gastar
2. Prova + agenda cheia — prazo, não dá para adiar
3. Recorrente que mudou — dinheiro vazando em silêncio
4. Categoria acima da média — informativo, acionável no médio prazo
5. Parcelamento terminando — boa notícia, pode esperar

O critério é o mesmo do ranking da busca: **o que ainda dá para agir vem antes
do que só dá para constatar.**

---

## A camada Claude

**Entrada:** os insights detectados, já com números.
**Saída:** 2–3 frases em português, no tom do app.

Regras no prompt:

- nunca inventar número: só os valores fornecidos;
- não repetir o que o dashboard já diz (o saldo, o total gasto);
- priorizar o acionável, e dizer O QUE fazer quando for óbvio;
- sem exclamação, sem "atenção!", sem emoji. O app fala baixo.

**Se a chave da Anthropic não estiver configurada** (`chatEnabled: false`, que
é o estado hoje no `.env` de trabalho), os insights **continuam funcionando** —
com o texto padrão do próprio detector. O motor não pode depender da IA para
existir; a IA melhora a redação, não produz o conteúdo.

---

## Endpoint e cache

`GET /api/insights?year&month`

**Cache em duas camadas:**

1. **Detectores**: recalculados a cada chamada. São queries que o `summary` já
   faz — barato.
2. **Texto do Claude**: guardado com chave `(userId, year, month, hash dos
   insights)`. O modelo só é chamado quando o CONJUNTO de insights muda, não a
   cada load. Sem isso, abrir o dashboard cinco vezes num dia custa cinco
   chamadas pagas para gerar o mesmo texto.

O hash é o que faz o cache ser correto e não só rápido: se um detector mudar de
valor, o texto tem que mudar junto — cache por tempo deixaria texto velho
descrevendo número novo.

**Tabela nova**, `InsightCache`, com `userId, year, month, hash, body,
createdAt`. Descartável: se sumir, recalcula.

---

## O que eu quero decidido antes de escrever código

1. **Os limiares acima estão bons?** 1,4× / 3 meses / R$ 100 / dia 8 / 7 dias
   são chutes informados, não medidos. Com os 62 lançamentos do banco atual dá
   para rodar os detectores em modo relatório e ver quantos disparariam por
   mês. **Se disparar mais de 2 por mês em média, os limiares estão frouxos.**
2. **O detector 2 (projeção) vale o risco?** É o mais útil e o mais fácil de
   errar — a interação com as fixas materializadas no dia 1 é sutil. Uma opção
   é deixá-lo para uma segunda leva, depois que os outros quatro estiverem
   rodando e confiáveis.
3. **Insight descartado volta?** A 6.2 diz que o descarte é lembrado. Proposta:
   descartar esconde **aquele insight naquele mês**; no mês seguinte ele volta
   se disparar de novo. Esconder para sempre transformaria o motor em algo que
   emudece com o tempo.

Com isso respondido, a implementação é: `lib/insights.ts` puro + testes,
`routes/insights.ts`, a camada Claude e o cache — nessa ordem, com os
detectores rodando em modo relatório antes de aparecerem na tela.
