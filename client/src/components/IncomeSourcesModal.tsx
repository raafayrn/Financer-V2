import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { Modal } from './Modal';

interface Props {
  initialSalary: number;
  initialVoucher: number;
  initialWalletBase: number;
  onCancel: () => void;
  onSubmit: (salary: number | null, voucher: number | null, walletBase: number | null) => Promise<void>;
}

/**
 * Edita salário, VR e o saldo BASE da carteira (Pix) do mês. Campo vazio =
 * não altera esse campo (permite editar só um deles). O saldo da carteira
 * mostrado no dashboard é essa base + receitas de Pix do mês − gastos de
 * Pix do mês; ele não acumula sozinho de um mês pro outro.
 */
export function IncomeSourcesModal({
  initialSalary,
  initialVoucher,
  initialWalletBase,
  onCancel,
  onSubmit,
}: Props) {
  const [salary, setSalary] = useState(initialSalary > 0 ? String(initialSalary) : '');
  const [voucher, setVoucher] = useState(initialVoucher > 0 ? String(initialVoucher) : '');
  const [walletBase, setWalletBase] = useState(initialWalletBase > 0 ? String(initialWalletBase) : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const salaryValue = salary.trim() ? Number(salary.replace(',', '.')) : null;
    const voucherValue = voucher.trim() ? Number(voucher.replace(',', '.')) : null;
    const walletBaseValue = walletBase.trim() ? Number(walletBase.replace(',', '.')) : null;

    if (salaryValue !== null && (!Number.isFinite(salaryValue) || salaryValue <= 0)) {
      setError('Salário deve ser maior que zero.');
      return;
    }
    if (voucherValue !== null && (!Number.isFinite(voucherValue) || voucherValue <= 0)) {
      setError('VR deve ser maior que zero.');
      return;
    }
    if (walletBaseValue !== null && (!Number.isFinite(walletBaseValue) || walletBaseValue < 0)) {
      setError('Saldo da carteira não pode ser negativo.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(salaryValue, voucherValue, walletBaseValue);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
        <h2 className="modal-title">Editar renda do mês</h2>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="field-row">
            <label className="field">
              <span>Salário (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </label>
            <label className="field">
              <span>VR (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={voucher}
                onChange={(e) => setVoucher(e.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>

          <label className="field">
            <span>Saldo da carteira (Pix) neste mês</span>
            <input
              type="text"
              inputMode="decimal"
              value={walletBase}
              onChange={(e) => setWalletBase(e.target.value)}
              placeholder="0,00"
            />
          </label>
          <p className="hint">
            Ajuste esse valor quando quiser recalibrar o saldo da carteira (ex.: no início do mês). Receitas e gastos lançados depois somam/subtraem a partir daqui.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
        </>
      )}
    </Modal>
  );
}
