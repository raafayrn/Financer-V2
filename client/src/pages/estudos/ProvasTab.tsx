import { api } from '../../api/client';
import { EditIcon, TrashIcon } from '../../components/icons';
import { formatDayMonth } from '../../utils/format';
import { WEEKDAYS_FULL, countdownLabel, daysUntil } from '../../lib/studies';
import { useEstudos } from './context';

export function ProvasTab() {
  const { data, subjectById, openExam, reload } = useEstudos();

  async function deleteExam(id: string) {
    if (!confirm('Excluir esta prova?')) return;
    await api.deleteExam(id);
    await reload();
  }

  const exams = [...data.upcomingExams].sort((a, b) => a.date.localeCompare(b.date));
  const proximas = exams.filter((e) => daysUntil(e.date) >= 0);
  const passadas = exams.filter((e) => daysUntil(e.date) < 0).reverse();

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

        <div className="ms-card-body">
          {proximas.length === 0 ? (
            <p className="empty">Nenhuma prova marcada.</p>
          ) : (
            <div className="ms-exam-grid">
              {proximas.map((ex) => {
                const subj = subjectById(ex.subjectId);
                const d = daysUntil(ex.date);
                const urgent = d <= 3;
                const date = new Date(ex.date + 'T00:00:00');
                return (
                  <article
                    key={ex.id}
                    className="ms-exam-card"
                    style={{ borderTopColor: subj?.color ?? 'var(--border-strong)' }}
                  >
                    <div className="ms-exam-head">
                      <span className={`ms-exam-countdown${urgent ? ' urgent' : ''}`}>
                        {countdownLabel(ex.date)}
                      </span>
                      <span className="ms-exam-actions">
                        <button
                          className="ms-icon-btn"
                          title="Editar"
                          onClick={() => openExam(ex)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="ms-icon-btn"
                          title="Excluir"
                          onClick={() => void deleteExam(ex.id)}
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    </div>
                    <h4 className="ms-exam-title">{ex.title}</h4>
                    {subj && (
                      <span className="ms-chip">
                        <span
                          className="ms-legend-dot"
                          style={{ margin: 0, background: subj.color }}
                        />
                        {subj.name}
                      </span>
                    )}
                    <span className="ms-muted ms-exam-date">
                      {WEEKDAYS_FULL[date.getDay()]}, {formatDayMonth(ex.date)}
                    </span>
                    {ex.notes && <p className="ms-exam-notes">{ex.notes}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {passadas.length > 0 && (
        <section className="ms-card">
          <div className="ms-card-head">
            <h3 className="ms-card-title">Já realizadas</h3>
            <span className="ms-muted">{passadas.length}</span>
          </div>
          {passadas.map((ex) => {
            const subj = subjectById(ex.subjectId);
            return (
              <div key={ex.id} className="ms-row ms-row-muted">
                <span
                  className="ms-row-avatar"
                  style={{
                    background: `${subj?.color ?? '#94a3b8'}22`,
                    color: subj?.color ?? '#64748b',
                  }}
                >
                  {formatDayMonth(ex.date).slice(0, 2)}
                </span>
                <span className="ms-row-name">
                  {ex.title}
                  <span className="ms-row-sub">
                    {subj?.name ?? 'Sem matéria'} · {countdownLabel(ex.date)}
                  </span>
                </span>
                <span className="ms-row-actions">
                  <button className="ms-icon-btn" title="Editar" onClick={() => openExam(ex)}>
                    <EditIcon />
                  </button>
                  <button
                    className="ms-icon-btn"
                    title="Excluir"
                    onClick={() => void deleteExam(ex.id)}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
