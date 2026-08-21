import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { SUBJECT_COLORS } from '../../lib/studies';
import { springSmooth } from '../../lib/motion';
import { useEstudos } from './context';

export function MateriasTab() {
  const { data, subjects, reload } = useEstudos();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    if (!subjectName.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    await api.createSubject({ name: subjectName.trim(), color });
    setSubjectName('');
    setAddingSubject(false);
    await reload();
  }
  async function deleteSubject(id: string) {
    if (!confirm('Excluir esta matéria e seus assuntos?')) return;
    await api.deleteSubject(id);
    await reload();
  }
  async function addTopic(subjectId: string) {
    const name = (topicInputs[subjectId] ?? '').trim();
    if (!name) return;
    await api.addTopic(subjectId, { name });
    setTopicInputs((p) => ({ ...p, [subjectId]: '' }));
    await reload();
  }
  async function toggleTopic(id: string, done: boolean) {
    await api.updateTopic(id, { done });
    await reload();
  }
  async function deleteTopic(id: string) {
    await api.deleteTopic(id);
    await reload();
  }

  const totalTopics = subjects.reduce((sum, s) => sum + s.topicCount, 0);
  const doneTopics = subjects.reduce((sum, s) => sum + s.doneCount, 0);

  return (
    <div className="ms-stack">
      <section className="ms-card">
        <div className="ms-card-head">
          <div>
            <h3 className="ms-card-title">Matérias</h3>
            <span className="ms-muted">
              {doneTopics}/{totalTopics} assuntos · {data.totals.overallProgress}% concluído
            </span>
          </div>
          <div className="ms-card-actions">
            {addingSubject ? (
              <form className="ms-inline-form" onSubmit={addSubject}>
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="Nome da matéria"
                  autoFocus
                />
                <button type="submit" className="ms-btn ms-btn-primary">
                  Adicionar
                </button>
                <button type="button" className="ms-btn" onClick={() => setAddingSubject(false)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <button className="ms-btn ms-btn-primary" onClick={() => setAddingSubject(true)}>
                <PlusIcon />
                Matéria
              </button>
            )}
          </div>
        </div>

        <div className="ms-card-body">
          {subjects.length === 0 ? (
            <p className="empty">Adicione suas matérias.</p>
          ) : (
            <div className="ms-subject-grid">
              {subjects.map((s) => {
                const open = expanded === s.id;
                return (
                  <article key={s.id} className={`ms-subject-card${open ? ' open' : ''}`}>
                    <button
                      className="ms-subject-head"
                      onClick={() => setExpanded(open ? null : s.id)}
                    >
                      <span className="ms-subject-dot" style={{ background: s.color }} />
                      <span className="ms-subject-info">
                        <span className="ms-subject-name">{s.name}</span>
                        <span className="ms-muted">
                          {s.doneCount}/{s.topicCount} assuntos · {s.progress}%
                        </span>
                      </span>
                      <span className={`ms-subject-chevron${open ? ' open' : ''}`}>
                        <ChevronDownIcon />
                      </span>
                    </button>
                    <span className="ms-progress">
                      <span
                        className="ms-progress-fill"
                        style={{ width: `${s.progress}%`, background: s.color }}
                      />
                    </span>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={springSmooth}
                          style={{ overflow: 'hidden' }}
                        >
                          <ul className="ms-topic-list">
                            {s.topics.map((t) => (
                              <li key={t.id} className="ms-topic-row">
                                <button
                                  className={`check-box${t.done ? ' checked' : ''}`}
                                  onClick={() => void toggleTopic(t.id, !t.done)}
                                  title={t.done ? 'Desmarcar' : 'Concluir'}
                                >
                                  {t.done && <CheckIcon />}
                                </button>
                                <span className={`ms-topic-name${t.done ? ' done' : ''}`}>
                                  {t.name}
                                </span>
                                <button
                                  className="ms-icon-btn"
                                  title="Remover"
                                  onClick={() => void deleteTopic(t.id)}
                                >
                                  <TrashIcon />
                                </button>
                              </li>
                            ))}
                          </ul>

                          <form
                            className="ms-inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addTopic(s.id);
                            }}
                          >
                            <input
                              type="text"
                              value={topicInputs[s.id] ?? ''}
                              onChange={(e) =>
                                setTopicInputs((p) => ({ ...p, [s.id]: e.target.value }))
                              }
                              placeholder="Novo assunto…"
                            />
                            <button type="submit" className="ms-btn ms-btn-primary">
                              <PlusIcon />
                            </button>
                          </form>

                          <div className="ms-subject-foot">
                            <button
                              className="ms-btn ms-btn-ghost"
                              onClick={() => void deleteSubject(s.id)}
                            >
                              Excluir matéria
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
