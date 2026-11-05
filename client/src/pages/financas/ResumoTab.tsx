import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandIcon } from '../../components/BrandIcon';
import { Delta, Kpi } from '../../components/Kpi';
import {
  ArrowInIcon,
  ArrowOutIcon,
  EditIcon,
  MinusIcon,
  PieIcon,
  PlusIcon,
  TrendUpIcon,
} from '../../components/icons';
import { useQuickActions } from '../../components/QuickActions';
import { formatCurrency, formatDayMonth, monthName, monthShort } from '../../utils/format';
import { GastoPorCategoria } from './GastoPorCategoria';
import { RitmoDeGastos } from './RitmoDeGastos';
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

/**
 * Resumo de Finanças no formato do print "Reports": quatro números no topo,
 * o ritmo de gastos e a rosca por categoria lado a lado, e o detalhe embaixo.
 */
export function ResumoTab() {
  const { summary, trend, year, month, expenses, incomes, categoryById, openModal } = useFinancas();
  const { newExpense } = useQuickActions();

  // Todas as contas que se repetem todo mes — nao so as assinaturas.
  const recurring = expenses
    .filter((e) => e.recurringExpenseId || e.recurring)
    .sort((a, b) => b.amount - a.amount);
  const recurringTotal = recurring.reduce((acc, e) => acc + e.amount, 0);

  // Parcelamentos: tem fim marcado e progresso, coisas que a lista de
  // recorrentes nao mostra.
  const installments = expenses
    .filter((e) => e.installmentGroupId && (e.installmentTotal ?? 0) > 1)
    .sort((a, b) => b.amount - a.amount);
  const installmentsTotal = installments.reduce((acc, e) => acc + e.amount, 0);

  // Os 6 mais recentes do mes, gastos e receitas juntos.
  const recentEntries = [
    ...expenses.map((e) => ({ kind: 'expense' as const, ...e })),
    ...incomes.map((i) => ({ kind: 'income' as const, ...i, categoryId: null })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 6);

  const totalAvailable = summary.income.total + summary.walletBalance;
  const voucherRemaining = summary.income.voucher - summary.accounts.foodVoucher;
  const salaryRemaining =
    summary.income.salary - (summary.accounts.fixed + summary.accounts.variable);

  // Gasto contra o mes anterior (mesma regra do TrendStrip: mes anterior
  // zerado nao vira comparacao).
  const idx = trend.findIndex((t) => t.year === year && t.month === month);
  const prev = idx > 0 ? trend[idx - 1] : undefined;
  const spentDelta =
    prev && prev.spent > 0 ? ((summary.totalSpent - prev.spent) / prev.spent) * 100 : null;
  // O "Savings rate" do print: quanto da renda do mes ainda esta livre.
  const freeRate = totalAvailable > 0 ? (summary.remaining / totalAvailable) * 100 : null;

  return (
    <div className="ms-grid12">
      {/* ---- Linha de numeros ---- */}
      <Kpi
        className="span-3"
        label="Renda do mês"
        value={formatCurrency(totalAvailable)}
        icon={ArrowInIcon}
        tone="good"
        action={
          <button
            type="button"
            className="ms-icon-btn"
            title="Definir salário, VR e carteira do mês"
            onClick={() => openModal({ kind: 'income-sources' })}
          >
            <EditIcon />
          </button>
        }
        foot={<span>salário, VR, carteira e extras</span>}
      />
      <Kpi
        className="span-3"
        label="Gastos"
        value={formatCurrency(summary.totalSpent)}
        icon={ArrowOutIcon}
        tone="bad"
        foot={
          <>
            <Delta pct={spentDelta} goodWhenUp={false} />
            <span>{prev && spentDelta !== null ? `vs ${monthName(prev.month).toLowerCase()}` : 'no mês'}</span>
          </>
        }
      />
      <Kpi
        className="span-3"
        label="Ainda posso gastar"
        value={formatCurrency(summary.remaining)}
        icon={TrendUpIcon}
        tone="accent"
        foot={
          <span className={summary.status === 'ok' ? undefined : 'ms-neg'}>
            {STATUS_MESSAGE[summary.status]}
          </span>
        }
      />
      <Kpi
        className="span-3"
        label="Renda livre"
        value={freeRate === null ? '—' : `${freeRate.toFixed(1).replace('.', ',')}%`}
        icon={PieIcon}
        foot={<span>da renda ainda não gasta</span>}
      />

      {/* ---- Graficos ---- */}
      <div className="span-8">
        <RitmoDeGastos />
      </div>
      <div className="span-4">
        <GastoPorCategoria />
      </div>

      {/* ---- Detalhe ---- */}
      <div className="span-8 ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Dinheiro do mês</h3>
            <div className="ms-card-actions">
              <button className="ms-btn ms-btn-ink" onClick={newExpense}>
                <MinusIcon />
                Gasto
              </button>
              <button className="ms-btn" onClick={() => openModal({ kind: 'income' })}>
                <PlusIcon />
                Receita
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
            <div className="ms-delta-line" style={{ marginTop: 14 }}>
              <span>Sobra no salário {formatCurrency(salaryRemaining)}</span>
              <span>·</span>
              <span>no VR {formatCurrency(voucherRemaining)}</span>
            </div>
          </div>
        </section>

        <section className="ms-card">
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

      <div className="span-4 ms-stack">
        <section className="ms-card">
          <div className="ms-card-head ms-card-head-plain">
            <h3 className="ms-card-title">Últimos meses</h3>
          </div>
          <div className="ms-card-body">
            <TrendStrip trend={trend} year={year} month={month} />
          </div>
        </section>

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
                          repete a contagem — fica so uma. */}
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
    </div>
  );
}
