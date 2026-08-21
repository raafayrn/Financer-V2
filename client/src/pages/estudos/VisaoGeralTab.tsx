import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatDayMonth } from '../../utils/format';
import {
  WEEKDAYS_FULL,
  classesForIso,
  countdownLabel,
  daysUntil,
  todayIsoStr,
} from '../../lib/studies';
import { useEstudos } from './context';

/** Bloco de número grande + label, repetido no topo da aba. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ms-card ms-tile">
      <span className="ms-label">{label}</span>
      <span className="ms-value">{value}</span>
      {hint && <span className="ms-muted">{hint}</span>}
    </div>
  );
}

export function VisaoGeralTab() {
  const { data, subjects, events, subjectById, openTask, reload } = useEstudos();

  const today = todayIsoStr();
  const todayClasses = classesForIso(today);
  const weekday = WEEKDAYS_FULL[new Date(today + 'T00:00:00').getDay()];
  const todayEvents = events.filter((e) => e.date === today);

  const upcomingExams = [...data.upcomingExams]
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextExam = upcomingExams[0];

  const overdue = data.pendingTasks.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0);
  const tasks = [...data.pendingTasks].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  async function completeTask(id: string) {
    await api.updateStudyTask(id, { done: true });
    await reload();
  }

  return (
    <div className="ms-stack">
      <div className="ms-tiles">
        <Tile
          label="Aulas hoje"
          value={String(todayClasses.length)}
          hint={todayClasses.length > 0 ? weekday : 'Sem aula'}
        />
        <Tile
          label="Próxima prova"
          value={nextExam ? countdownLabel(nextExam.date) : '—'}
          hint={nextExam ? nextExam.title : 'Nenhuma marcada'}
        />
        <Tile
          label="Tarefas pendentes"
          value={String(data.totals.pendingTaskCount)}
          hint={overdue.length > 0 ? `${overdue.length} atrasada(s)` : 'Nada atrasado'}
        />
        <Tile
          label="Progresso geral"
          value={`${data.totals.overallProgress}%`}
          hint={`${subjects.length} matéria(s)`}
        />
      </div>

      <div className="ms-grid-main-side">
        <div className="ms-stack">
          <section className="ms-card">
            <div className="ms-card-head">
              <div>
                <h3 className="ms-card-title">Aulas de hoje</h3>
                <span className="ms-muted">{weekday}</span>
              </div>
              <div className="ms-card-actions">
                <Link className="ms-btn" to="/agenda">
                  Ver agenda
                </Link>
              </div>
            </div>
            {todayClasses.length === 0 && todayEvents.length === 0 ? (
              <p className="empty">Nenhuma aula hoje.</p>
            ) : (
              <>
                {todayClasses.map((c, i) => {
                  const subj = subjects.find((s) => s.name === c.name);
                  return (
                    <div key={`class-${i}`} className="ms-row">
                      <span className="ms-row-time">{c.time}</span>
                      <span className="ms-row-name">
                        {c.name}
                        <span className="ms-row-sub">Aula</span>
                      </span>
                      {subj && (
                        <span className="ms-chip">
                          <span
                            className="ms-legend-dot"
                            style={{ margin: 0, background: subj.color }}
                          />
                          {subj.progress}%
                        </span>
                      )}
                    </div>
                  );
                })}
                {todayEvents.map((ev) => (
                  <div key={ev.id} className="ms-row">
                    <span className="ms-row-time">{ev.time ?? '—'}</span>
                    <span className="ms-row-name">
                      {ev.title}
                      <span className="ms-row-sub">Evento</span>
                    </span>
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="ms-card">
            <div className="ms-card-head">
              <h3 className="ms-card-title">Tarefas pendentes</h3>
              <span className="ms-muted">{data.totals.pendingTaskCount}</span>
              <div className="ms-card-actions">
                <button className="ms-btn ms-btn-primary" onClick={() => openTask()}>
                  + Tarefa
                </button>
              </div>
            </div>
            {tasks.length === 0 ? (
              <p className="empty">Tudo em dia! 🎉</p>
            ) : (
              tasks.slice(0, 6).map((t) => {
                const subj = subjectById(t.subjectId);
                const late = t.dueDate ? daysUntil(t.dueDate) < 0 : false;
                return (
                  <div key={t.id} className="ms-row">
                    <button
                      className="check-box"
                      title="Concluir"
                      onClick={() => void completeTask(t.id)}
                    />
                    <span className="ms-row-name">
                      {t.title}
                      <span className="ms-row-sub">
                        {subj ? `${subj.name}` : 'Sem matéria'}
                        {t.dueDate ? ` · ${formatDayMonth(t.dueDate)}` : ''}
                      </span>
                    </span>
                    {t.dueDate && (
                      <span className={`ms-chip${late ? ' ms-chip-danger' : ''}`}>
                        {late ? 'Atrasada' : countdownLabel(t.dueDate)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>

        <div className="ms-stack">
          <section className="ms-card">
            <div className="ms-card-head">
              <h3 className="ms-card-title">Próximas provas</h3>
            </div>
            {upcomingExams.length === 0 ? (
              <p className="empty">Nenhuma prova marcada.</p>
            ) : (
              upcomingExams.slice(0, 5).map((ex) => {
                const subj = subjectById(ex.subjectId);
                const d = daysUntil(ex.date);
                return (
                  <div key={ex.id} className="ms-row">
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
                      <span className="ms-row-sub">{subj?.name ?? 'Sem matéria'}</span>
                    </span>
                    <span className={`ms-chip${d <= 3 ? ' ms-chip-danger' : ''}`}>
                      {d === 0 ? 'Hoje' : `${d}d`}
                    </span>
                  </div>
                );
              })
            )}
          </section>

          <section className="ms-card">
            <div className="ms-card-head">
              <h3 className="ms-card-title">Progresso por matéria</h3>
            </div>
            <div className="ms-card-body">
              {subjects.length === 0 ? (
                <p className="ms-muted" style={{ margin: 0 }}>
                  Nenhuma matéria cadastrada.
                </p>
              ) : (
                <div className="ms-stack" style={{ gap: 12 }}>
                  {subjects.map((s) => (
                    <div key={s.id}>
                      <div className="ms-progress-head">
                        <span>{s.name}</span>
                        <span className="ms-muted">{s.progress}%</span>
                      </div>
                      <span className="ms-progress">
                        <span
                          className="ms-progress-fill"
                          style={{ width: `${s.progress}%`, background: s.color }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
