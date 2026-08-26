import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandIcon } from '../../components/BrandIcon';
import { ChatBox } from '../../components/ChatBox';
import { EditIcon, MinusIcon, PlusIcon } from '../../components/icons';
import { formatCurrency, formatDayMonth, monthName, monthShort } from '../../utils/format';
import { GastoPorCategoria } from './GastoPorCategoria';
import { useFinancas } from './context';
import type { TrendPoint } from './context';

const STATUS_MESSAGE: Record<string, string> = {
  ok: 'Dentro da sua renda disponível',
  warning: 'Atenção: perto de gastar toda a renda',
  over: 'Você já gastou mais do que ganhou',
};

/** Par label/valor das colunas de "Dinheiro do mês". */
function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="ms-summary-row">
      <dt style={strong ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{label}</dt>
      <dd style={strong ? { fontWeight: 600 } : undefined}>{value}</dd>
    </div>
  );
}

/**
 * Tendência dos últimos meses, do tamanho de um selo. Mora dentro do hero
 * porque responde à mesma pergunta que o número grande — "estou bem este
 * mês?" —, só que olhando pra trás.
 */
function TrendStrip({ trend, year, month }: { trend: TrendPoint[]; year: number; month: number }) {
  // O hook vem antes da guarda: com menos de dois meses nao ha tendencia,
  // mas a ordem dos hooks nao pode depender disso.
  const [hovered, setHovered] = useState<number | null>(null);
  if (trend.length < 2) return null;

  const max = Math.max(1, ...trend.map((t) => t.spent));
  const currentIndex = trend.findIndex((t) => t.year === year && t.month === month);
  const current = currentIndex >= 0 ? trend[currentIndex] : trend[trend.length - 1];
  const previous = currentIndex > 0 ? trend[currentIndex - 1] : undefined;

  // Mês anterior zerado (o histórico ainda não existia) não vira comparação:
  // daria "+∞%" e não diz nada.
  const delta =
    previous && previous.spent > 0
      ? Math.round(((current.spent - previous.spent) / previous.spent) * 100)
      : null;

  return (
    <div className="ms-hero-trend">
      <span className="ms-hero-trend-label">
        {delta !== null && previous ? (
          <>
            <span className={`ms-spark-delta${delta > 0 ? ' up' : ''}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>{' '}
            {delta > 0 ? 'a mais que' : 'a menos que'} {monthName(previous.month).toLowerCase()}
          </>
        ) : (
          'Gasto nos últimos meses'
        )}
      </span>
      <div className="ms-spark" onMouseLeave={() => setHovered(null)}>
        {trend.map((t, i) => {
          const isCurrent = t.year === year && t.month === month;
          const before = i > 0 ? trend[i - 1] : undefined;
          // Mesma regra do delta do cabecalho: mes anterior zerado nao compara.
          const heightPct = (t.spent / max) * 100;
          const change =
            before && before.spent > 0
              ? Math.round(((t.spent - before.spent) / before.spent) * 100)
              : null;
          return (
            <div
              key={`${t.year}-${t.month}`}
              className={`ms-spark-col${hovered === i ? ' hovered' : ''}`}
              onMouseEnter={() => setHovered(i)}
            >
              {hovered === i && (
                <div className="ms-spark-tip" role="tooltip">
                  <span className="ms-spark-tip-month">
                    {monthName(t.month)} de {t.year}
                  </span>
                  <span className="ms-spark-tip-value">{formatCurrency(t.spent)}</span>
                  {change !== null && before && (
                    <span className={`ms-spark-tip-delta${change > 0 ? ' up' : ''}`}>
                      {change > 0 ? '↑' : '↓'} {Math.abs(change)}% vs {monthShort(before.month)}
                    </span>
                  )}
                </div>
              )}
              <div className="ms-spark-track">
                <div
                  className={`ms-spark-fill${isCurrent ? ' current' : ''}`}
                  style={{ height: `${heightPct}%` }}
                />
                {/* O mes fica dentro da coluna: fora dela, seis rotulos
                    empurravam a faixa pra baixo so pra dizer o obvio. */}
                {/* Barra alta cobre o rotulo; barra baixa deixa ele no fundo
                    do card. A cor segue quem esta atras. */}
                <span className={`ms-spark-month${heightPct >= 32 ? ' on-fill' : ''}`}>
                  {monthShort(t.month)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResumoTab() {
  const {
    summary,
    trend,
    year,
    month,
    expenses,
    incomes,
    categoryById,
    openModal,
    reload,
  } = useFinancas();

  // Todas as contas que se repetem todo mes — nao so as assinaturas, que eram
  // uma categoria entre varias (aluguel, internet, academia ficavam de fora).
  // Sai do que ja esta carregado, sem requisicao nova.
  const recurring = expenses
    .filter((e) => e.recurringExpenseId || e.recurring)
    .sort((a, b) => b.amount - a.amount);
  const recurringTotal = recurring.reduce((acc, e) => acc + e.amount, 0);

  // Parcelamentos ficam num card proprio: tem fim marcado e progresso, coisas
  // que a lista de recorrentes nao mostra. Cada parcela e uma despesa com
  // installmentGroupId — o plano e a parcela que caiu no mes exibido.
  const installments = expenses
    .filter((e) => e.installmentGroupId && (e.installmentTotal ?? 0) > 1)
    .sort((a, b) => b.amount - a.amount);
  const installmentsTotal = installments.reduce((acc, e) => acc + e.amount, 0);

  // Os 6 mais recentes do mes, gastos e receitas juntos — mesma ordem da aba
  // Lancamentos, so que cortada.
  const recentEntries = [
    ...expenses.map((e) => ({ kind: 'expense' as const, ...e })),
    ...incomes.map((i) => ({ kind: 'income' as const, ...i, categoryId: null })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 6);

  const totalAvailable = summary.income.total + summary.walletBalance;
  // VR e Salário restantes (a Carteira já é sempre líquida). O salário funciona
  // como limite da fatura: todo gasto no cartão (fixo + variável) sai dele.
  const voucherRemaining = summary.income.voucher - summary.accounts.foodVoucher;
  const salaryRemaining =
    summary.income.salary - (summary.accounts.fixed + summary.accounts.variable);

  return (
    <div className="ms-resumo">
      {/* Faixa única no topo: o número que importa, o que sobrou de cada fonte
          e a tendência — tudo na mesma linha, sem um card por informação. */}
      <section className={`ms-card ms-hero ms-hero-band status-${summary.status} ms-col-12`}>
        {/* Metade esquerda: o numero do mes em cima, a comparacao com o mes
            passado embaixo — as duas leituras de "como estou indo". */}
        <div className="ms-hero-left">
        {/* A renda de cada fonte se define aqui, no canto da faixa onde os tres
            numeros aparecem — antes so dava pra editar pelo icone do card
            "Dinheiro do mes", bem mais abaixo. */}
        <button
          type="button"
          className="ms-hero-edit"
          title="Definir salário, VR e carteira do mês"
          onClick={() => openModal({ kind: 'income-sources' })}
        >
          <EditIcon />
          <span>Definir renda</span>
        </button>
        <div className="ms-hero-row">
        <div className="ms-hero-main">
          <span className="ms-label">Ainda posso gastar</span>
          <span className="ms-hero-value">{formatCurrency(summary.remaining)}</span>
          <span className="ms-hero-status">{STATUS_MESSAGE[summary.status]}</span>
        </div>

        <div className="ms-hero-stats">
          <div>
            <span className="ms-label">Salário</span>
            <span className="ms-hero-stat-value">{formatCurrency(salaryRemaining)}</span>
          </div>
          <div>
            <span className="ms-label">Vale (VR)</span>
            <span className="ms-hero-stat-value">{formatCurrency(voucherRemaining)}</span>
          </div>
          <div>
            <span className="ms-label">Carteira</span>
            <span className="ms-hero-stat-value">{formatCurrency(summary.walletBalance)}</span>
          </div>
        </div>

        </div>

        <TrendStrip trend={trend} year={year} month={month} />
        </div>

        {/* O donut fecha a faixa: sobrava largura vazia à direita e ele estava
            num card próprio de 433px só pra mostrar quatro fatias. */}
        <div className="ms-hero-donut">
          <GastoPorCategoria inline />
        </div>
      </section>

      {/* Entra x sai lado a lado: eram dois cards em colunas diferentes, o que
          obrigava a atravessar a tela pra comparar as duas metades da conta. */}
      {/* Coluna larga: a conta do mes e o extrato. Empilhadas num container
          proprio pra cada coluna correr no seu ritmo — na grade crua, um card
          curto deixava buraco ate a proxima linha. */}
      <div className="ms-col-8 ms-stack">
      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Dinheiro do mês</h3>
          <div className="ms-card-actions">
            <button
              className="ms-icon-btn"
              title="Editar salário, VR e carteira"
              onClick={() => openModal({ kind: 'income-sources' })}
            >
              <EditIcon />
            </button>
          </div>
        </div>
        <div className="ms-card-body">
          <div className="ms-money-split">
            <div className="ms-money-col">
              <div className="ms-money-col-head">
                <span className="ms-label">Entra</span>
                <span className="ms-money-col-total">{formatCurrency(totalAvailable)}</span>
              </div>
              <dl className="ms-summary">
                <SummaryRow label="Salário" value={formatCurrency(summary.income.salary)} />
                <SummaryRow label="Vale (VR)" value={formatCurrency(summary.income.voucher)} />
                <SummaryRow label="Carteira (Pix)" value={formatCurrency(summary.walletBalance)} />
                {summary.income.extra > 0 && (
                  <SummaryRow label="Outros" value={formatCurrency(summary.income.extra)} />
                )}
              </dl>
            </div>

            <div className="ms-money-col">
              <div className="ms-money-col-head">
                <span className="ms-label">Sai</span>
                <span className="ms-money-col-total ms-neg">
                  {formatCurrency(summary.accounts.total)}
                </span>
              </div>
              <dl className="ms-summary">
                <SummaryRow label="Fixos (cartão)" value={formatCurrency(summary.accounts.fixed)} />
                <SummaryRow
                  label="Variáveis (cartão)"
                  value={formatCurrency(summary.accounts.variable)}
                />
                <SummaryRow
                  label="Fatura estimada"
                  value={formatCurrency(summary.accounts.fixed + summary.accounts.variable)}
                  strong
                />
                <SummaryRow
                  label="Vale-alimentação"
                  value={formatCurrency(summary.accounts.foodVoucher)}
                />
                <SummaryRow label="Carteira (Pix)" value={formatCurrency(summary.accounts.wallet)} />
              </dl>
            </div>
          </div>

          {/* Os mesmos dois botoes do Dashboard: lancar gasto e receita e o que
              se faz aqui o tempo todo, e a conta (Pix ou outra) ja se escolhe
              dentro do proprio formulario. */}
          <div className="ms-quick-actions">
            <button className="ms-quick ms-quick-expense" onClick={() => openModal({ kind: 'create' })}>
              <MinusIcon />
              Gasto
            </button>
            <button className="ms-quick ms-quick-income" onClick={() => openModal({ kind: 'income' })}>
              <PlusIcon />
              Receita
            </button>
          </div>
        </div>
      </section>


      {/* Ultimos lancamentos ocupa a faixa larga: linha por lancamento se
          beneficia da largura, o donut nao — quatro fatias cabem numa coluna. */}
      <section className="ms-card ms-col-8">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Últimos lançamentos</h3>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/financas/lancamentos">
              Ver todos
            </Link>
          </div>
        </div>
        {recentEntries.length === 0 ? (
          <p className="empty">Nenhum lançamento este mês.</p>
        ) : (
          recentEntries.map((entry) => {
            const cat = entry.categoryId ? categoryById.get(entry.categoryId) : undefined;
            return (
              <div key={`${entry.kind}-${entry.id}`} className="ms-ledger-row">
                <BrandIcon
                  description={entry.description}
                  fallbackColor={entry.kind === 'income' ? 'var(--ok)' : cat?.color}
                  size={30}
                />
                <span className="ms-ledger-main">
                  <span className="ms-ledger-title">
                    <span className="ms-ledger-name">{entry.description}</span>
                    <span
                      className={`ms-ledger-amount ${entry.kind === 'income' ? 'ms-pos' : 'ms-neg'}`}
                    >
                      {entry.kind === 'income' ? '+' : '−'}
                      {formatCurrency(entry.amount)}
                    </span>
                  </span>
                  <span className="ms-ledger-meta">
                    <span style={{ color: entry.kind === 'income' ? 'var(--ok)' : cat?.color }}>
                      {entry.kind === 'income' ? 'Receita' : (cat?.name ?? 'Sem categoria')}
                    </span>
                    <span className="ms-ledger-sep">·</span>
                    {formatDayMonth(entry.date)}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </section>
      </div>

      {/* Coluna estreita e alta: a lista cresce pra baixo e rola dentro do card,
          sem esticar a linha inteira. */}
      {/* Coluna estreita: o que se repete todo mes e o resumo por categoria. */}
      <div className="ms-col-4 ms-stack">
      <section className="ms-card ms-card-tall">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Recorrentes</h3>
            <span className="ms-muted">{formatCurrency(recurringTotal)} por mês</span>
          </div>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/financas/recorrentes">
              Gerenciar
            </Link>
          </div>
        </div>
        <div className="ms-card-scroll">
          {recurring.length === 0 ? (
            <p className="empty">Nenhuma conta fixa neste mês.</p>
          ) : (
            recurring.map((item) => {
              const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
              return (
                <div key={item.id} className="ms-sub-row">
                  <BrandIcon description={item.description} fallbackColor={cat?.color} />
                  <span className="ms-sub-main">
                    <span className="ms-sub-name">{item.description}</span>
                    {/* A categoria diz mais que "Todo mes": numa lista que agora
                        mistura aluguel, streaming e academia, ela separa. */}
                    <span className="ms-sub-meta">{cat?.name ?? 'Todo mês'}</span>
                  </span>
                  <span className="ms-sub-amount">{formatCurrency(item.amount)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Parcelamentos</h3>
            <span className="ms-muted">{formatCurrency(installmentsTotal)} neste mês</span>
          </div>
          <div className="ms-card-actions">
            <Link className="ms-btn ms-btn-ghost" to="/financas/recorrentes/parcelamentos">
              Gerenciar
            </Link>
          </div>
        </div>
        <div className="ms-card-scroll">
          {installments.length === 0 ? (
            <p className="empty">Nenhuma compra parcelada neste mês.</p>
          ) : (
            installments.map((item) => {
              const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
              const no = item.installmentNo ?? 1;
              const total = item.installmentTotal ?? 1;
              const left = total - no;
              return (
                <div key={item.installmentGroupId} className="ms-sub-row">
                  <BrandIcon description={item.description} fallbackColor={cat?.color} />
                  <span className="ms-sub-main">
                    {/* A descricao ja termina em "(2/10)" e a linha de baixo
                        repete a mesma contagem — fica so uma. */}
                    <span className="ms-sub-name">
                      {item.description.replace(/\s*\(\d+\/\d+\)\s*$/, '')}
                    </span>
                    <span className="ms-sub-meta">
                      Parcela {no} de {total}
                      {left > 0 ? ` · faltam ${left}` : ' · última'}
                    </span>
                    <span className="ms-progress">
                      <span className="ms-progress-fill" style={{ width: `${(no / total) * 100}%` }} />
                    </span>
                  </span>
                  <span className="ms-sub-amount">{formatCurrency(item.amount)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      </div>

      {/* Botao flutuante: nao ocupa celula da grade. */}
      <ChatBox
        onSaved={reload}
        onPreviews={(previews) => openModal({ kind: 'chat-batch', previews, index: 0 })}
      />
    </div>
  );
}
