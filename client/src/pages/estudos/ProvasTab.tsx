import { useState } from 'react';
import { api } from '../../api/client';
import type { Exam } from '../../api/types';
import { RowMenu } from '../../components/RowMenu';
import { formatDayMonth } from '../../utils/format';
import { WEEKDAYS_SHORT, countdownLabel, daysUntil } from '../../lib/studies';
import { useEstudos } from './context';

/**
 * Faixas por proximidade. A pergunta do dia a dia é "o que eu estudo agora",
 * não "quantas provas de Estática existem" — então o corte principal é o
 * tempo, e a matéria vira filtro (os chips no topo) em vez de virar seção.
 * Agrupar por matéria empurrava a prova de amanhã pro terceiro bloco.
 */
const BANDS = [
  { id: 'week', label: 'Esta semana', max: 7 },
  { id: 'month', label: 'Próximos 30 dias', max: 30 },
  { id: 'later', label: 'Mais para frente', max: Infinity },
] as const;

export function ProvasTab() {
  const { data, subjectById, openExam, reload } = useEstudos();
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  async function deleteExam(id: string) {
    if (!confirm('Excluir esta prova?')) return;
    await api.deleteExam(id);
    await reload();
  }

  const exams = [...data.upcomingExams].sort((a, b) => a.date.localeCompare(b.date));
  const proximas = exams.filter((e) => daysUntil(e.date) >= 0);
  const passadas = exams.filter((e) => daysUntil(e.date) < 0).reverse();

  // Um chip por matéria que realmente tem prova marcada, na ordem em que a
  // próxima prova acontece — o filtro segue a mesma lógica da lista.
  const chips: { id: string; name: string; color: string; count: number }[] = [];
  for (const ex of proximas) {
    const subj = subjectById(ex.subjectId);
    const id = subj?.id ?? 'none';
    const found = chips.find((c) => c.id === id);
    if (found) found.count += 1;
    else chips.push({ id, name: subj?.name ?? 'Sem matéria', color: subj?.color ?? '#94a3b8', count: 1 });
  }

  const matchesFilter = (ex: Exam) =>
    subjectFilter === 'all' || (ex.subjectId ?? 'none') === subjectFilter;

  const visiveis = proximas.filter(matchesFilter);
  const passadasVisiveis = passadas.filter(matchesFilter);

  // Cada prova cai na primeira faixa que couber.
  const bands = BANDS.map((band, i) => {
    const min = i === 0 ? 0 : BANDS[i - 1].max + 1;
    return { ...band, items: visiveis.filter((e) => { const d = daysUntil(e.date); return d >= min && d <= band.max; }) };
  }).filter((b) => b.items.length > 0);

  function renderRow(ex: Exam, past = false) {
    const subj = subjectById(ex.subjectId);
    const d = daysUntil(ex.date);
    const urgent = !past && d <= 3;
    const date = new Date(ex.date + 'T00:00:00');
    return (
      <div key={ex.id} className={`ms-exam-row${past ? ' ms-row-muted' : ''}`}>
        <span
          className="ms-row-flag"
          style={{ background: subj?.color ?? 'var(--border-strong)' }}
        />
        <span className="ms-exam-row-main">
          <span className="ms-exam-row-title">
            {ex.title}
            {ex.term && <span className="ms-ledger-badge">{ex.term}º bim</span>}
          </span>
          <span className="ms-exam-row-meta">
            <span style={{ color: subj?.color }}>{subj?.name ?? 'Sem matéria'}</span>
            <span className="ms-ledger-sep">·</span>
            <span>
              {WEEKDAYS_SHORT[date.getDay()]}, {formatDayMonth(ex.date)}
            </span>
            {ex.notes && (
              <>
                <span className="ms-ledger-sep">·</span>
                <span className="ms-exam-row-notes">{ex.notes}</span>
              </>
            )}
          </span>
        </span>
        <span className={`ms-exam-row-countdown${urgent ? ' urgent' : ''}`}>
          {countdownLabel(ex.date)}
        </span>
        <RowMenu
          ariaLabel={`Ações de ${ex.title}`}
          items={[
            { label: 'Editar', onSelect: () => openExam(ex) },
            { label: 'Excluir', danger: true, onSelect: () => void deleteExam(ex.id) },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="ms-stack">
      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Provas</h3>
            <span className="ms-muted">
              {proximas.length} próxima(s)
              {passadas.length > 0 && ` · ${passadas.length} já realizada(s)`}
            </span>
          </div>
          <div className="ms-card-actions">
            <button className="ms-btn ms-btn-primary" onClick={() => openExam()}>
              + Prova
            </button>
          </div>
        </div>

        {/* Só vale filtrar quando há mais de uma matéria em jogo. */}
        {chips.length > 1 && (
          <div className="ms-exam-filters">
            <button
              className={`ms-chip ms-chip-btn${subjectFilter === 'all' ? ' active' : ''}`}
              onClick={() => setSubjectFilter('all')}
            >
              Todas <span className="ms-chip-count">{proximas.length}</span>
            </button>
            {chips.map((c) => (
              <button
                key={c.id}
                className={`ms-chip ms-chip-btn${subjectFilter === c.id ? ' active' : ''}`}
                onClick={() => setSubjectFilter(c.id)}
              >
                <span className="ms-legend-dot" style={{ margin: 0, background: c.color }} />
                {c.name} <span className="ms-chip-count">{c.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ms-card-body ms-card-body-flush">
          {visiveis.length === 0 ? (
            <p className="empty">
              {proximas.length === 0 ? 'Nenhuma prova marcada.' : 'Nenhuma prova nesta matéria.'}
            </p>
          ) : (
            bands.map((band) => (
              <div key={band.id} className="ms-exam-band">
                <div className="ms-exam-band-head">
                  <span className="ms-exam-band-label">{band.label}</span>
                  <span className="ms-exam-band-count">{band.items.length}</span>
                </div>
                {band.items.map((ex) => renderRow(ex))}
              </div>
            ))
          )}
        </div>
      </section>

      {passadasVisiveis.length > 0 && (
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Já realizadas</h3>
            <span className="ms-muted">{passadasVisiveis.length}</span>
          </div>
          <div className="ms-card-body ms-card-body-flush">
            {passadasVisiveis.map((ex) => renderRow(ex, true))}
          </div>
        </section>
      )}
    </div>
  );
}
