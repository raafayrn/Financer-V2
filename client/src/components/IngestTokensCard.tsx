import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { IngestTokenCreated, IngestTokenRow } from '../api/types';

/**
 * Tokens dos canais automáticos (atalho do iPhone, webhook de e-mail).
 *
 * Um por canal: revogar o do celular perdido não pode derrubar o e-mail. O
 * valor em claro aparece uma única vez, logo depois de criar — o servidor
 * guarda só o hash e não sabe mais qual era.
 */

function formatMoment(iso: string | null): string {
  if (!iso) return 'nunca usado';
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

export function IngestTokensCard() {
  const [tokens, setTokens] = useState<IngestTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O token recém-criado, mostrado até você sair da tela. Não volta nunca.
  const [justCreated, setJustCreated] = useState<IngestTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setTokens(await api.listIngestTokens());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar tokens.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const created = await api.createIngestToken(label.trim());
      setJustCreated(created);
      setCopied(false);
      setLabel('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar token.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(row: IngestTokenRow) {
    setError(null);
    try {
      await api.revokeIngestToken(row.id);
      if (justCreated?.id === row.id) setJustCreated(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao revogar.');
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência o valor continua na tela para
      // ser copiado à mão — não vale bloquear o fluxo por isso.
      setCopied(false);
    }
  }

  const ativos = tokens.filter((t) => !t.revokedAt);

  return (
    <section className="ms-card">
      <div className="ms-card-head">
        <div>
          <h3 className="ms-card-title">Canais automáticos</h3>
          <span className="ms-muted">
            {loading
              ? 'Carregando…'
              : ativos.length === 0
                ? 'Nenhum token ativo'
                : `${ativos.length} ${ativos.length === 1 ? 'token ativo' : 'tokens ativos'}`}
          </span>
        </div>
      </div>

      <div className="ms-card-body">
        <p className="hint" style={{ marginTop: 0 }}>
          Um token por canal — o atalho do iPhone, o encaminhamento de e-mail do banco. Eles só
          servem para registrar lançamentos pendentes; não dão acesso ao resto do app.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {justCreated && (
          <div className="ms-token-reveal">
            <span className="ms-label">Token de “{justCreated.label}”</span>
            <code className="ms-token-value">{justCreated.token}</code>
            <div className="ms-token-reveal-actions">
              <button className="ms-btn" onClick={() => void copy(justCreated.token)}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button className="ms-btn ms-btn-ghost" onClick={() => setJustCreated(null)}>
                Já guardei
              </button>
            </div>
            {/* Dito sem rodeio: quem fechar sem copiar precisa criar outro. */}
            <span className="ms-token-warn">
              Guarde agora. Este valor não aparece de novo — o app guarda só um hash dele.
            </span>
          </div>
        )}

        <div className="ms-token-new">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nome do canal (ex.: iPhone, E-mail Nubank)"
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <button className="ms-btn" onClick={() => void create()} disabled={creating || !label.trim()}>
            {creating ? 'Criando…' : 'Criar token'}
          </button>
        </div>

        {tokens.length > 0 && (
          <div className="ms-token-list">
            {tokens.map((t) => (
              <div key={t.id} className={`ms-token-row${t.revokedAt ? ' ms-token-revoked' : ''}`}>
                <span className="ms-token-main">
                  <span className="ms-token-label">{t.label}</span>
                  <span className="ms-token-meta">
                    <code>{t.prefix}…</code>
                    {' · '}
                    {t.revokedAt
                      ? `revogado em ${formatMoment(t.revokedAt)}`
                      : `último uso: ${formatMoment(t.lastUsedAt)}`}
                  </span>
                </span>
                {!t.revokedAt && (
                  <button className="ms-btn ms-btn-ghost" onClick={() => void revoke(t)}>
                    Revogar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
