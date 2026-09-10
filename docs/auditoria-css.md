# Auditoria de CSS

Levantamento, sem alterar nada. Números medidos em 10/09/2026 sobre
`client/src/index.css` e `client/src/styles/monarch.css`.

| Arquivo | Bytes | Linhas | Classes definidas |
|---|---|---|---|
| `index.css` | 67.957 | 3.203 | 361 |
| `monarch.css` | 69.967 | 2.413 | 313 |

O CSS somado é maior que todo o código TypeScript do client. Não é sinal de
problema por si só, mas é o tamanho que justifica a auditoria.

---

## 1. Seletores definidos nos dois arquivos, e quem vence

A ordem de importação em `main.tsx` é `index.css` **e depois** `monarch.css`.
Com a mesma especificidade, **monarch vence** — é o último a falar. Onde
`index.css` tiver especificidade maior (seletor composto), ele vence, e é aí
que mora a confusão.

17 classes estão nos dois arquivos:

| Classe | Regras em index | Regras em monarch | Observação |
|---|---|---|---|
| `.active` | 10 | 5 | genérica demais para viver em dois lugares |
| `.dropdown-menu` | 6 | 1 | monarch ajusta o que index define |
| `.selected` | 5 | 1 | idem `.active` |
| `.dropdown-item` | 3 | 1 | |
| `.month-arrow` | 3 | 3 | disputa real, difícil de prever |
| `.status-over` | 3 | 2 | |
| `.status-warning` | 3 | 1 | |
| `.modal` | 2 | 1 | |
| `.card` | 2 | 1 | |
| `.today` | 2 | 1 | |
| `.done` | 2 | 1 | |
| `.empty` | 1 | 3 | monarch domina |
| `.open`, `.palette`, `.month-nav`, `.year-nav`, `.dropdown-item-danger` | 1 | 1–2 | |

O caso mais perigoso é `.active` e `.selected`: nomes de estado genéricos,
usados por componentes diferentes, definidos em dois arquivos. Mudar um deles
mexe em telas que não têm relação entre si.

## 2. Classes sem referência no código

O varredor achou **178 classes** que não aparecem em nenhum `.tsx`.

**Atenção antes de apagar qualquer uma:** o varredor procura o nome literal.
Classe montada em template string escapa dele. Já identifiquei estes falsos
positivos na própria lista:

- `.status-ok`, `.status-over`, `.status-warning` — montadas como
  `` `ms-hero status-${status}` ``;
- `.toast-error`, `.toast-info` — `` `toast-${kind}` ``;
- `.center-pad` — usada em `App.tsx`.

Ou seja: a lista é ponto de partida, não sentença. O que ela mostra de real é
o **legado de duas gerações de layout**. Famílias inteiras aparecem, e são
justamente as de telas que já foram reescritas:

- `.navbar-desktop*`, `.topbar*`, `.bottom-nav`, `.nav-item-pill` — a navegação
  anterior ao `ms-*`;
- `.agenda-*` (31 classes) — a agenda antes da atual;
- `.study-cal-*` (13), `.exam-*` (8), `.task-*` (5), `.subject-*` (4) — estudos
  antes do `StudiesShell`;
- `.recurring-item*` (7), `.exp-*` (9), `.chart-*` (7) — finanças antes do
  monarch;
- `.subtab*`, `.segmented`, `.estudos-tab*` — três gerações de abas convivendo.

Isso é a maior parte dos ~68 KB de `index.css`.

## 3. Tokens declarados e nunca usados

**Zero.** Todo `--token` declarado é referenciado em algum lugar. O sistema de
tokens está saudável — o problema é o CSS legado em volta dele.

## 4. Cores fora do sistema de tokens

49 ocorrências de hex ou `rgb()` fora dos blocos `:root`/`[data-theme]`.
Separando por natureza:

- **Sombras e brilhos** (`rgba(0,0,0,0.1)`, `rgba(255,255,255,0.5)`) — a maior
  parte. Preto e branco com alfa funcionam nos dois temas, e virar token traria
  pouco. Baixa prioridade.
- **Cores de marca fixas** — `#22c55e` (verde) aparece 3× em `index.css`, fora
  do token `--ok`. Estas são as que quebram o tema: valor fixo que não responde
  ao claro/escuro.
- **`color: #fff` sobre `var(--primary)`** — funciona hoje porque o primário é
  escuro no tema claro; no escuro o primário é laranja claro, e branco em cima
  dele fica ilegível. Já existe `readableOn()` no client resolvendo exatamente
  isso para as cores de matéria — o CSS não usa.

## 5. Estrutura proposta

Um arquivo por responsabilidade, com a cascata explícita na ordem de import:

```
styles/
  tokens.css      -- :root, [data-theme], @media (prefers-color-scheme)
                  -- SÓ declaração de variável. Nenhum seletor de elemento.
  base.css        -- reset, tipografia, elementos nus (button, input, a)
  components.css  -- .ms-card, .modal, .dropdown, .toast, .palette, .skeleton…
                  -- um bloco por componente, na ordem alfabética
  pages.css       -- o que é mesmo específico de uma tela e não dá para
                  -- generalizar (grid do dashboard, calendário da agenda)
```

Importados nessa ordem em `main.tsx`. A regra que a estrutura impõe: **nada em
`components.css` redefine algo de `base.css`; nada em `pages.css` redefine
componente.** Quando precisar, é sinal de que o componente está faltando uma
variante — e variante se resolve com uma classe modificadora, não sobrescrevendo
de fora.

## 6. Ordem sugerida de remoção

De menor para maior risco, com build a cada lote:

1. **`.navbar-desktop*`, `.topbar*`, `.bottom-nav`** — a navegação antiga.
   Nenhuma dessas famílias tem nome dinâmico. É o lote mais seguro.
2. **`.agenda-*` antigas** — conferir uma a uma contra `AgendaPage.tsx`, que
   hoje usa `ms-*`.
3. **`.study-cal-*`, `.exam-*`, `.task-*`** — mesma checagem contra as abas de
   estudos.
4. **`.exp-*`, `.recurring-item*`, `.chart-*`** — finanças antiga.
5. **Só então** unificar `.active`/`.selected`/`.card`, que é o lote que exige
   olhar caso a caso.

Antes de cada lote, vale um `grep` pelo prefixo em template strings
(`` `...${ ``) para não repetir o falso positivo do item 2.

## 7. O que eu faria primeiro

Se fosse escolher **um** item: as **cores de marca fixas** (`#22c55e` e
`color: #fff` sobre primário). São poucas, são bug de tema visível hoje no
escuro, e a correção é trocar por token. O resto é limpeza — melhora a
manutenção, não muda o que o usuário vê.
