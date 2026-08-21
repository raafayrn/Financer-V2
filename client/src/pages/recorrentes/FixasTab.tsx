import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { BrandIcon } from '../../components/BrandIcon';
import { Dropdown } from '../../components/Dropdown';
import { EditIcon, TrashIcon } from '../../components/icons';
import type { Account, RecurringExpense } from '../../api/types';
import { formatCurrency, monthName } from '../../utils/format';
import { useRecorrentes } from './context';

/** Conta padrão de uma despesa fixa (a maioria cai no cartão). */
function defaultAccountId(accounts: Account[]): string {
  return accounts.find((a) => a.kind === 'CREDIT_CARD')?.id ?? '';
}

const emptyForm = { description: '', amount: '', dayOfMonth: '1', categoryId: '', accountId: '' };

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function FixasTab() {
  const {
    items,
    categories,
    accounts,
    categoryById,
    accountById,
    year,
    month,
    reload,
    notice,
    setNotice,
  } = useRecorrentes();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, accountId: defaultAccountId(accounts) });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'pull' | 'import' | null>(null);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, accountId: defaultAccountId(accounts) });
  }

  function startEdit(item: RecurringExpense) {
    setEditingId(item.id);
    setNotice(null);
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
    setNotice(null);

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ kind: 'error', text: 'Informe um valor maior que zero.' });
      return;
    }
    const dayOfMonth = Number(form.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      setNotice({ kind: 'error', text: 'Dia deve ser entre 1 e 31.' });
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
        setNotice({ kind: 'info', text: 'Despesa fixa atualizada. O lançamento deste mês foi ajustado.' });
      } else {
        await api.createRecurring(payload);
        setNotice({ kind: 'info', text: 'Despesa fixa criada e já lançada neste mês.' });
      }
      resetForm();
      await reload();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: RecurringExpense) {
    setNotice(null);
    try {
      await api.updateRecurring(item.id, { active: !item.active });
      await reload();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro ao alterar.' });
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

    setNotice(null);
    try {
      await api.deleteRecurring(item.id, alsoDelete);
      await reload();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro ao remover.' });
    }
  }

  /** Mês seguinte ao que está em exibição. */
  const proximo = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  /**
   * As fixas entram sozinhas quando o mês vira; isto adianta o processo para
   * dar pra ver a fatura seguinte antes dela começar.
   */
  async function handlePullNextMonth() {
    setNotice(null);
    setBusy('pull');
    try {
      const res = await api.materializeRecurring(proximo.year, proximo.month);
      const nome = `${monthName(proximo.month)}/${proximo.year}`;
      setNotice({
        kind: 'info',
        text:
          res.createdCount === 0
            ? `As fixas de ${nome} já estavam lançadas (${formatCurrency(res.recurringTotal)}).`
            : `${res.createdCount} despesa(s) lançada(s) em ${nome}, somando ${formatCurrency(res.recurringTotal)}.`,
      });
      await reload();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Erro ao lançar no próximo mês.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setNotice(null);
    setBusy('import');
    try {
      const res = await api.importRecurring(year, month);
      if (res.importedCount === 0) {
        setNotice({
          kind: 'info',
          text: 'Nenhuma despesa recorrente nova encontrada neste mês para importar.',
        });
      } else {
        setNotice({
          kind: 'info',
          text: `${res.importedCount} despesa(s) importada(s): ${res.imported.join(', ')}.`,
        });
        await reload();
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Erro ao importar.' });
    } finally {
      setBusy(null);
    }
  }

  const active = items.filter((i) => i.active);
  const paused = items.filter((i) => !i.active);
  const total = active.reduce((sum, i) => sum + i.amount, 0);

  function renderItem(item: RecurringExpense) {
    const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined;
    const acc = item.accountId ? accountById.get(item.accountId) : undefined;
    return (
      <motion.div
        key={item.id}
        className={`ms-row${item.active ? '' : ' ms-row-muted'}`}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <BrandIcon description={item.description} fallbackColor={cat?.color} size={30} />
        <span className="ms-row-name">
          {item.description}
          <span className="ms-row-sub">
            Todo mês · vence dia {item.dayOfMonth}
            {(item.generatedCount ?? 0) > 0 && ` · ${item.generatedCount} lançada(s)`}
          </span>
        </span>
        <span className="ms-row-meta ms-row-account">{acc?.name ?? 'Sem conta'}</span>
        <span className="ms-row-amount">{formatCurrency(item.amount)}</span>
        <span className="ms-row-actions">
          <button
            className="ms-icon-btn"
            title={item.active ? 'Pausar' : 'Retomar'}
            onClick={() => void toggleActive(item)}
          >
            {item.active ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="ms-icon-btn" title="Editar" onClick={() => startEdit(item)}>
            <EditIcon />
          </button>
          <button className="ms-icon-btn" title="Remover" onClick={() => void remove(item)}>
            <TrashIcon />
          </button>
        </span>
      </motion.div>
    );
  }

  return (
    <div className="ms-grid-main-side">
      <div className="ms-stack">
        {notice && (
          <div className={`alert ${notice.kind === 'error' ? 'alert-error' : 'alert-info'}`}>
            {notice.text}
          </div>
        )}

        <section className="ms-card">
          <div className="ms-card-head">
            <div>
              <h3 className="ms-card-title">Despesas fixas</h3>
              <span className="ms-muted">{formatCurrency(total)} por mês</span>
            </div>
            <div className="ms-card-actions">
              <button className="ms-btn" onClick={() => void handleImport()} disabled={busy !== null}>
                {busy === 'import' ? 'Importando…' : 'Importar do mês'}
              </button>
              <button
                className="ms-btn ms-btn-primary"
                onClick={() => void handlePullNextMonth()}
                disabled={busy !== null || items.length === 0}
              >
                {busy === 'pull'
                  ? 'Lançando…'
                  : `Puxar para ${monthName(proximo.month)}/${proximo.year}`}
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="empty">
              Nenhuma despesa fixa cadastrada. Aluguel, streaming e academia são bons começos.
            </p>
          ) : (
            <>
              <AnimatePresence initial={false}>{active.map(renderItem)}</AnimatePresence>
              {paused.length > 0 && (
                <>
                  <div className="ms-row-group">
                    <span>Pausadas</span>
                    <span>{paused.length}</span>
                  </div>
                  <AnimatePresence initial={false}>{paused.map(renderItem)}</AnimatePresence>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <div className="ms-stack">
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">
              {editingId ? 'Editar despesa fixa' : 'Nova despesa fixa'}
            </h3>
          </div>
          <div className="ms-card-body">
            <form onSubmit={handleSubmit} className="modal-form">
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

              <div className="ms-card-footer-actions">
                <button type="submit" className="ms-btn ms-btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Adicionar'}
                </button>
                {editingId && (
                  <button type="button" className="ms-btn" onClick={resetForm}>
                    Cancelar edição
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        <section className="ms-card">
          <div className="ms-card-body">
            <p className="ms-muted" style={{ margin: 0 }}>
              Cadastre uma vez e o app lança sozinho todo mês. O lançamento entra no{' '}
              <strong>dia 1</strong>, para a fatura do mês já nascer inteira — o vencimento serve
              de referência.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
