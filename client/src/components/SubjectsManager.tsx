import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { StudiesOverview, Subject } from '../api/types';
import { springSmooth, springTap } from '../lib/motion';
import { DATA_COLORS } from '../utils/palette';
import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from './icons';

/**
 * Cadastro de matérias e assuntos.
 *
 * Saiu de Estudos e passou a viver em Ajustes: é configuração de semestre,
 * feita a cada seis meses, e não disputava em pé de igualdade com o uso
 * diário da agenda.
 */
export function SubjectsManager() {
  const [data, setData] = useState<StudiesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await api.getStudiesOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subjects: Subject[] = data?.subjects ?? [];

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createSubject({
      name: name.trim(),
      color: DATA_COLORS[subjects.length % DATA_COLORS.length],
    });
    setName('');
    setAdding(false);
    await load();
  }
  async function deleteSubject(id: string) {
    if (!confirm('Excluir esta matéria e seus assuntos?')) return;
    await api.deleteSubject(id);
    await load();
  }
  async function addTopic(subjectId: string) {
    const value = (topicInputs[subjectId] ?? '').trim();
    if (!value) return;
    await api.addTopic(subjectId, { name: value });
    setTopicInputs((p) => ({ ...p, [subjectId]: '' }));
    await load();
  }
  async function toggleTopic(id: string, done: boolean) {
    await api.updateTopic(id, { done });
    await load();
  }
  async function deleteTopic(id: string) {
    await api.deleteTopic(id);
    await load();
  }

  if (loading) return <div className="center-pad"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <section className="card">
      <div className="section-head">
        <h3 className="section-title">Matérias</h3>
        {data && <span className="hint">{data.totals.overallProgress}% concluído</span>}
      </div>

      {subjects.length === 0 && !adding ? (
        <div className="empty-state">
          <p className="empty-state-title">Nenhuma matéria cadastrada</p>
          <p className="empty-state-text">Cadastre as matérias do semestre para usá-las em provas e tarefas.</p>
        </div>
      ) : (
        <div className="subject-grid">
          {subjects.map((s) => (
            <div key={s.id} className="subject-card">
              <button className="subject-head" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <span className="subject-color" style={{ background: s.color }} />
                <div className="subject-info">
                  <span className="subject-name">{s.name}</span>
                  <span className="subject-progress-text">
                    {s.doneCount}/{s.topicCount} assuntos · {s.progress}%
                  </span>
                </div>
                <span className={`subject-chevron${expanded === s.id ? ' open' : ''}`}>
                  <ChevronDownIcon />
                </span>
              </button>
              <div className="subject-bar">
                <div className="subject-bar-fill" style={{ width: `${s.progress}%`, background: s.color }} />
              </div>
              <AnimatePresence initial={false}>
                {expanded === s.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={springSmooth}
                    style={{ overflow: 'hidden' }}
                  >
                    <ul className="topic-list">
                      {s.topics.map((t) => (
                        <li key={t.id} className="topic-row">
                          <button
                            className={`check-box${t.done ? ' checked' : ''}`}
                            onClick={() => toggleTopic(t.id, !t.done)}
                            title={t.done ? 'Desmarcar' : 'Concluir'}
                          >
                            {t.done && <CheckIcon />}
                          </button>
                          <span className={`topic-name${t.done ? ' done' : ''}`}>{t.name}</span>
                          <button className="icon-btn" title="Remover" onClick={() => deleteTopic(t.id)}>
                            <TrashIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form className="topic-add" onSubmit={(e) => { e.preventDefault(); void addTopic(s.id); }}>
                      <input
                        type="text"
                        value={topicInputs[s.id] ?? ''}
                        onChange={(e) => setTopicInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                        placeholder="Novo assunto…"
                      />
                      <button type="submit" className="btn-primary btn-sm"><PlusIcon /></button>
                    </form>
                    <div className="subject-footer">
                      <button className="btn-ghost btn-sm" onClick={() => deleteSubject(s.id)}>Excluir matéria</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <form className="topic-add" style={{ marginTop: 12 }} onSubmit={addSubject}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da matéria" autoFocus />
          <button type="submit" className="btn-primary btn-sm">Adicionar</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancelar</button>
        </form>
      ) : (
        <motion.button
          className="btn-ghost btn-sm"
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
          onClick={() => setAdding(true)}
          whileTap={{ scale: 0.95 }}
          transition={springTap}
        >
          <PlusIcon /> Matéria
        </motion.button>
      )}
    </section>
  );
}
