import { useState } from 'react';
import { api } from '../../api/client';
import { EditIcon, TrashIcon } from '../../components/icons';
import { formatDayMonth } from '../../utils/format';
import { countdownLabel, daysUntil } from '../../lib/studies';
import { useEstudos } from './context';

type Filter = 'todas' | 'atrasadas' | 'sem-prazo';

export function TarefasTab() {
  const { data, subjects, subjectById, openTask, reload } = useEstudos();
  const [filter, setFilter] = useState<Filter>('todas');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  async function toggleTask(id: string) {
    await api.updateStudyTask(id, { done: true });
    await reload();
  }
  async function deleteTask(id: string) {
    await api.deleteStudyTask(id);
    await reload();
  }

  const all = data.pendingTasks;
  const overdue = all.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0);
  const noDate = all.filter((t) => !t.dueDate);
  const thisWeek = all.filter((t) => {
    if (!t.dueDate) return false;
    const d = daysUntil(t.dueDate);
    return d >= 0 && d <= 7;
  });

  let list = all;
  if (filter === 'atrasadas') list = overdue;
  else if (filter === 'sem-prazo') list = noDate;
  if (subjectFilter !== 'all') list = list.filter((t) => t.subjectId === subjectFilter);

  // Sem prazo vai para o fim; o resto por vencimento.
  const sorted = [...list].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return (
    <div className="ms-grid-main-side">
      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Tarefas e entregas</h3>
            <span className="ms-muted">{sorted.length} pendente(s)</span>
          </div>
          <div className="ms-card-actions">
            <div className="ms-segment">
              {(['todas', 'atrasadas', 'sem-prazo'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={`ms-segment-item${filter === f ? ' active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  <span>{f === 'todas' ? 'Todas' : f === 'atrasadas' ? 'Atrasadas' : 'Sem prazo'}</span>
                </button>
              ))}
            </div>
            <button className="ms-btn ms-btn-primary" onClick={() => openTask()}>
              + Tarefa
            </button>
          </div>
        </div>

        {subjects.length > 0 && (
          <div className="ms-chip-row">
            <button
              className={`ms-chip ms-chip-btn${subjectFilter === 'all' ? ' active' : ''}`}
              onClick={() => setSubjectFilter('all')}
            >
              Todas as matérias
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                className={`ms-chip ms-chip-btn${subjectFilter === s.id ? ' active' : ''}`}
                onClick={() => setSubjectFilter(s.id)}
              >
                <span className="ms-legend-dot" style={{ margin: 0, background: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="empty">Tudo em dia! 🎉</p>
        ) : (
          <>
            {sorted.map((t) => {
              const subj = subjectById(t.subjectId);
              const late = t.dueDate ? daysUntil(t.dueDate) < 0 : false;
              return (
                <div key={t.id} className="ms-row">
                  <button
                    className="check-box"
                    title="Concluir"
                    onClick={() => void toggleTask(t.id)}
                  />
                  <span className="ms-row-name">
                    {t.title}
                    <span className="ms-row-sub">
                      {subj?.name ?? 'Sem matéria'}
                      {t.dueDate ? ` · ${formatDayMonth(t.dueDate)}` : ' · sem prazo'}
                    </span>
                  </span>
                  {t.dueDate && (
                    <span className={`ms-chip${late ? ' ms-chip-danger' : ''}`}>
                      {late ? 'Atrasada' : countdownLabel(t.dueDate)}
                    </span>
                  )}
                  <span className="ms-row-actions">
                    <button className="ms-icon-btn" title="Editar" onClick={() => openTask(t)}>
                      <EditIcon />
                    </button>
                    <button
                      className="ms-icon-btn"
                      title="Excluir"
                      onClick={() => void deleteTask(t.id)}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="ms-card">
        <div className="ms-card-head">
          <h3 className="ms-card-title">Resumo</h3>
        </div>
        <div className="ms-card-body">
          <dl className="ms-summary">
            <div className="ms-summary-row">
              <dt>Pendentes</dt>
              <dd>{all.length}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Atrasadas</dt>
              <dd style={overdue.length > 0 ? { color: 'var(--over)' } : undefined}>
                {overdue.length}
              </dd>
            </div>
            <div className="ms-summary-row">
              <dt>Vencem em 7 dias</dt>
              <dd>{thisWeek.length}</dd>
            </div>
            <div className="ms-summary-row">
              <dt>Sem prazo</dt>
              <dd>{noDate.length}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
