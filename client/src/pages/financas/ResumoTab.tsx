import { ChatBox } from '../../components/ChatBox';
import { EditIcon } from '../../components/icons';
import { formatCurrency, monthShort } from '../../utils/format';
import { useFinancas } from './context';

const STATUS_MESSAGE: Record<string, string> = {
  ok: 'Dentro da sua renda disponível',
  warning: 'Atenção: perto de gastar toda a renda',
  over: 'Você já gastou mais do que ganhou',
};

/** Par label/valor do painel lateral, no formato do "Summary" do Monarch. */
function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="ms-summary-row">
      <dt style={strong ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{label}</dt>
      <dd style={strong ? { fontWeight: 600 } : undefined}>{value}</dd>
    </div>
  );
}

export function ResumoTab() {
  const { summary, trend, year, month, openModal, reload, walletAccountId } = useFinancas();

  const totalAvailable = summary.income.total + summary.walletBalance;
  // VR e Salário restantes (a Carteira já é sempre líquida). O salário funciona
  // como limite da fatura: todo gasto no cartão (fixo + variável) sai dele.
  const voucherRemaining = summary.income.voucher - summary.accounts.foodVoucher;
  const salaryRemaining =
    summary.income.salary - (summary.accounts.fixed + summary.accounts.variable);
  const maxTrend = Math.max(1, ...trend.map((t) => t.spent));

  return (
    <div className="ms-grid-main-side">
      <div className="ms-stack">
        {/* Destaque principal: quanto ainda posso gastar (renda − gasto) */}
        <section className={`ms-card ms-hero status-${summary.status}`}>
          <span className="ms-label">Ainda posso gastar</span>
          <span className="ms-hero-value">{formatCurrency(summary.remaining)}</span>
          <span className="ms-hero-status">{STATUS_MESSAGE[summary.status]}</span>

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
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Gastos nos últimos meses</h3>
          </div>
          <div className="ms-card-body">
            <div className="ms-bars">
              {trend.map((t) => {
                const h = (t.spent / maxTrend) * 100;
                const isCurrent = t.year === year && t.month === month;
                return (
                  <div
                    key={`${t.year}-${t.month}`}
                    className="ms-bar-col"
                    title={`${monthShort(t.month)}/${t.year}: ${formatCurrency(t.spent)}`}
                  >
                    <div className="ms-bar-track">
                      <div
                        className={`ms-bar-fill${isCurrent ? ' current' : ''}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="ms-bar-label">{monthShort(t.month)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Assistente: lançar por texto/foto ou perguntar sobre os gastos */}
        <ChatBox
          onSaved={reload}
          onPreviews={(previews) => openModal({ kind: 'chat-batch', previews, index: 0 })}
        />
      </div>

      <div className="ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Renda do mês</h3>
            <div className="ms-card-actions">
              <button
                className="ms-icon-btn"
                title="Editar salário e VR"
                onClick={() => openModal({ kind: 'income-sources' })}
              >
                <EditIcon />
              </button>
            </div>
          </div>
          <div className="ms-card-body">
            <span className="ms-value">{formatCurrency(totalAvailable)}</span>
            <dl className="ms-summary" style={{ marginTop: 10 }}>
              <SummaryRow label="Salário" value={formatCurrency(summary.income.salary)} />
              <SummaryRow label="Vale (VR)" value={formatCurrency(summary.income.voucher)} />
              <SummaryRow label="Carteira (Pix)" value={formatCurrency(summary.walletBalance)} />
              {summary.income.extra > 0 && (
                <SummaryRow label="Outros" value={formatCurrency(summary.income.extra)} />
              )}
            </dl>
            <div className="ms-card-footer-actions">
              <button
                className="ms-btn"
                onClick={() => openModal({ kind: 'income', defaultAccountId: walletAccountId })}
              >
                + Receita Pix
              </button>
              <button className="ms-btn" onClick={() => openModal({ kind: 'income' })}>
                + Renda avulsa
              </button>
            </div>
          </div>
        </section>

        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Gasto até agora</h3>
          </div>
          <div className="ms-card-body">
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
              <SummaryRow label="Total" value={formatCurrency(summary.accounts.total)} strong />
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
