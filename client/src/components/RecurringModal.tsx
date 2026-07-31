import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Account, Category, RecurringExpense } from '../api/types';
import { formatCurrency, monthName } from '../utils/format';
import { springSmooth, springTap } from '../lib/motion';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import { EditIcon, TrashIcon } from './icons';

interface Props {
  year: number;
  month: number;
  categories: Category[];
  accounts: Account[];
  onCancel: () => void;
  /** Chamado quando algo mudou e o dashboard precisa recarregar. */
  onChanged: () => void;
}

/** Conta padrão de uma despesa fixa (a maioria cai no cartão). */
function defaultAccountId(accounts: Account[]): string {
  return accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? '';
}

const emptyForm = { description: '', amount: '', dayOfMonth: '1', categoryId: '', accountId: '' };

/**
 * Gerencia os templates de despesa fixa. Cadastrado uma vez, o app lança a
 * despesa sozinho todo mês — não existe mais "trazer do mês anterior".
 */
export function RecurringModal({ year, month, categories, accounts, onCancel, onChanged }: Props) {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, accountId: defaultAccountId(accounts) });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.listRecurring());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, accountId: defaultAccountId(accounts) });
  }

  function startEdit(item: RecurringExpense) {
    setEditingId(item.id);
    setError(null);
    setForm({
      description: item.description,
      amount: String(item.amount),
      dayOfMonth: String(item.dayOfMonth),
      categoryId: item.categoryId ?? '',
      accountId: item.accountId ?? '',
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const dayOfMonth = Number(form.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      setError('Dia deve ser entre 1 e 31.');
      return;
    }

    const payload = {
      description: form.description.trim(),
      amount,
      dayOfMonth,
      categoryId: form.categoryId || null,
      accountId: form.accountId || null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.updateRecurring(editingId, payload);
        setInfo('Despesa fixa atualizada. O lançamento deste mês foi ajustado.');
      } else {
        await api.createRecurring(payload);
        setInfo('Despesa fixa criada e já lançada neste mês.');
      }
      resetForm();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: RecurringExpense) {
    setError(null);
    try {
      await api.updateRecurring(item.id, { active: !item.active });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar.');
    }
  }

  async function remove(item: RecurringExpense) {
    const generated = item.generatedCount ?? 0;
    const alsoDelete =
      generated > 0 &&
      confirm(
        `Apagar também os ${generated} lançamento${generated > 1 ? 's' : ''} que "${item.description}" já gerou?\n\n` +
          'OK = apaga tudo (some dos relatórios).\n' +
          'Cancelar = mantém o histórico e só para de lançar daqui pra frente.',
      );

    if (!alsoDelete && !confirm(`Parar de lançar "${item.description}" automaticamente?`)) return;

    setError(null);
    try {
      await api.deleteRecurring(item.id, alsoDelete);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover.');
    }
  }

  /** Mês seguinte ao que está em exibição. */
  const proximo = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  /**
   * Puxa as fixas para o próximo mês antes dele chegar — assim a fatura de
   * agosto já fica montada enquanto você ainda está em julho.
   */
  async function handlePullNextMonth() {
    setError(null);
    setInfo(null);
    setPulling(true);
    try {
      const res = await api.materializeRecurring(proximo.year, proximo.month);
      const nome = `${monthName(proximo.month)}/${proximo.year}`;
      if (res.createdCount === 0) {
        setInfo(`As fixas de ${nome} já estavam lançadas (${formatCurrency(res.recurringTotal)}).`);
      } else {
        setInfo(
          `${res.createdCount} despesa(s) lançada(s) em ${nome}, somando ${formatCurrency(res.recurringTotal)}.`,
        );
      }
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao lançar no próximo mês.');
    } finally {
      setPulling(false);
    }
  }

  async function handleImport() {
    setError(null);
    setInfo(null);
    setImporting(true);
    try {
      const res = await api.importRecurring(year, month);
      if (res.importedCount === 0) {
        setInfo('Nenhuma despesa recorrente nova encontrada neste mês para importar.');
      } else {
        setInfo(`${res.importedCount} despesa(s) importada(s): ${res.imported.join(', ')}.`);
        await load();
        onChanged();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar.');
    } finally {
      setImporting(false);
    }
  }

  const total = items.filter((i) => i.active).reduce((sum, i) => sum + i.amount, 0);

  return (
    <Modal onCancel={onCancel}>
      {(close) => (
        <>
          <h2 className="modal-title">Despesas fixas</h2>
          <p className="modal-hint">
            Cadastre uma vez e o app lança sozinho todo mês. O lançamento entra
            no <strong>dia 1</strong>, para a fatura do mês já nascer inteira — o
            vencimento serve de referência.
          </p>

          {loading ? (
            <div className="center-pad">
              <div className="spinner" />
            </div>
          ) : (
            <>
              {items.length > 0 && (
                <>
                  <div className="recurring-total">
                    <span>Total fixo por mês</span>
                    <strong>{formatCurrency(total)}</strong>
                  </div>

                  {/*
                    As fixas entram sozinhas quando o mês vira. Este botão
                    adianta isso: monta o próximo mês agora, para dar pra ver
                    a fatura seguinte antes dela começar.
                  */}
                  <button
                    type="button"
                    className="btn-primary recurring-pull"
                    onClick={handlePullNextMonth}
                    disabled={pulling}
                  >
                    {pulling
                      ? 'Lançando…'
                      : `Puxar fixas para ${monthName(proximo.month)}/${proximo.year}`}
                  </button>
                </>
              )}

              <ul className="recurring-list">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      className={`recurring-item${item.active ? '' : ' recurring-item--paused'}`}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={springSmooth}
                      layout
                    >
                      <div className="recurring-item-main">
                        <span className="recurring-item-desc">{item.description}</span>
                        <span className="recurring-item-meta">
                          vence dia {item.dayOfMonth}
                          {!item.active && ' · pausada'}
                          {(item.generatedCount ?? 0) > 0 && ` · ${item.generatedCount} lançada(s)`}
                        </span>
                      </div>
                      <span className="recurring-item-amount">{formatCurrency(item.amount)}</span>
                      <div className="recurring-item-actions">
                        <motion.button
                          className="icon-btn-outline"
                          title={item.active ? 'Pausar' : 'Retomar'}
                          onClick={() => toggleActive(item)}
                          whileTap={{ scale: 0.9 }}
                          transition={springTap}
                        >
                          {item.active ? '⏸' : '▶'}
                        </motion.button>
                        <motion.button
                          className="icon-btn-outline"
                          title="Editar"
                          onClick={() => startEdit(item)}
                          whileTap={{ scale: 0.9 }}
                          transition={springTap}
                        >
                          <EditIcon />
                        </motion.button>
                        <motion.button
                          className="icon-btn-outline"
                          title="Remover"
                          onClick={() => remove(item)}
                          whileTap={{ scale: 0.9 }}
                          transition={springTap}
                        >
                          <TrashIcon />
                        </motion.button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              {items.length === 0 && (
                <p className="empty">
                  Nenhuma despesa fixa cadastrada. Aluguel, streaming e academia são bons começos.
                </p>
              )}

              <form onSubmit={handleSubmit} className="modal-form">
                <h3 className="section-title">
                  {editingId ? 'Editar despesa fixa' : 'Nova despesa fixa'}
                </h3>

                <label className="field">
                  <span>Descrição</span>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Aluguel"
                    required
                    maxLength={200}
                  />
                </label>

                <div className="field-row">
                  <label className="field">
                    <span>Valor (R$)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0,00"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Vence dia</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <div className="field-row">
                  <div className="field">
                    <span>Categoria</span>
                    <Dropdown
                      value={form.categoryId}
                      onChange={(v) => setForm({ ...form, categoryId: v })}
                      ariaLabel="Categoria"
                      options={[
                        { value: '', label: 'Sem categoria' },
                        ...categories.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div className="field">
                    <span>Conta</span>
                    <Dropdown
                      value={form.accountId}
                      onChange={(v) => setForm({ ...form, accountId: v })}
                      ariaLabel="Conta"
                      options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {info && <div className="alert alert-info">{info}</div>}

                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={close}>
                    Fechar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleImport}
                    disabled={importing}
                    title="Cria templates a partir das despesas marcadas como recorrentes neste mês"
                  >
                    {importing ? 'Importando…' : 'Importar do mês'}
                  </button>
                  {editingId && (
                    <button type="button" className="btn-ghost" onClick={resetForm}>
                      Cancelar edição
                    </button>
                  )}
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
