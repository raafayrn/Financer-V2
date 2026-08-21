import { BrandIcon } from '../../components/BrandIcon';
import { formatCurrency, monthName } from '../../utils/format';
import { useRecorrentes } from './context';

interface Plan {
  groupId: string;
  description: string;
  installmentNo: number;
  installmentTotal: number;
  amount: number;
  categoryId: string | null;
  accountId: string | null;
}

export function ParcelamentosTab() {
  const { expenses, categoryById, accountById, year, month } = useRecorrentes();

  // Não existe endpoint de planos: cada parcela é uma despesa com
  // installmentGroupId, então o plano é a parcela que caiu no mês exibido.
  const plans: Plan[] = expenses
    .filter((e) => e.installmentGroupId && (e.installmentTotal ?? 0) > 1)
    .map((e) => ({
      groupId: e.installmentGroupId as string,
      description: e.description,
      installmentNo: e.installmentNo ?? 1,
      installmentTotal: e.installmentTotal ?? 1,
      amount: e.amount,
      categoryId: e.categoryId,
      accountId: e.accountId,
    }))
    .sort((a, b) => b.amount - a.amount);

  const monthTotal = plans.reduce((sum, p) => sum + p.amount, 0);
  const remainingTotal = plans.reduce(
    (sum, p) => sum + p.amount * (p.installmentTotal - p.installmentNo),
    0,
  );

  if (plans.length === 0) {
    return (
      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Parcelamentos</h3>
        </div>
        <p className="empty">
          Nenhuma compra parcelada em {monthName(month).toLowerCase()}/{year}. Parcelamentos são
          criados ao lançar uma despesa com mais de uma parcela.
        </p>
      </section>
    );
  }

  return (
    <div className="ms-grid-main-side">
      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Parcelamentos</h3>
            <span className="ms-muted">
              {formatCurrency(monthTotal)} em {monthName(month).toLowerCase()}
            </span>
          </div>
        </div>

        {plans.map((p) => {
          const cat = p.categoryId ? categoryById.get(p.categoryId) : undefined;
          const acc = p.accountId ? accountById.get(p.accountId) : undefined;
          const pct = (p.installmentNo / p.installmentTotal) * 100;
          const left = p.installmentTotal - p.installmentNo;
          return (
            <div key={p.groupId} className="ms-row">
              <BrandIcon description={p.description} fallbackColor={cat?.color} size={30} />
              <span className="ms-row-name">
                {p.description}
                <span className="ms-row-sub">
                  Parcela {p.installmentNo} de {p.installmentTotal}
                  {left > 0 ? ` · faltam ${left}` : ' · última'}
                  {acc ? ` · ${acc.name}` : ''}
                </span>
                <span className="ms-progress">
                  <span className="ms-progress-fill" style={{ width: `${pct}%` }} />
                </span>
              </span>
              <span className="ms-row-amount">
                {formatCurrency(p.amount)}
                <span className="ms-row-sub ms-row-sub-right">
                  de {formatCurrency(p.amount * p.installmentTotal)}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Resumo</h3>
        </div>
        <div className="ms-card-body">
          <dl className="ms-summary">
            <div className="ms-summary-row">
              <dt>Planos ativos</dt>
              <dd>{plans.length}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Peso no mês</dt>
              <dd>{formatCurrency(monthTotal)}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Ainda a pagar</dt>
              <dd>{formatCurrency(remainingTotal)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
