import { useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '../../api/client';
import { useScene } from '../../context/SceneContext';
import { useTheme } from '../../context/ThemeContext';
import { ImageIcon, MoonIcon, SunIcon } from '../../components/icons';
import { prepareSceneImage, SCENE_PRESETS } from '../../lib/scene';

/**
 * Aparência: tema, plano de fundo (cena embutida ou foto própria) e a opção
 * de reduzir a transparência. O fundo é salvo no servidor, então vale para
 * o iPhone e o computador; a transparência é por aparelho.
 */
export function AparenciaCard() {
  const { theme, toggleTheme } = useTheme();
  const { scene, choosePreset, chooseCustom, glassOff, setGlassOff } = useScene();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Não deu para trocar o fundo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => chooseCustom(await prepareSceneImage(file)));
  }

  return (
    <section className="ms-card">
      <div className="ms-card-head">
        <h3 className="ms-card-title">Aparência</h3>
      </div>

      <div className="ms-row">
        <span className="ms-row-name">
          Tema
          <span className="ms-row-sub">{theme === 'dark' ? 'Escuro (cozy)' : 'Claro'}</span>
        </span>
        <span className="ms-row-actions ms-row-actions-fixed">
          <button className="ms-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Usar claro' : 'Usar escuro'}
          </button>
        </span>
      </div>

      <div className="ms-card-body" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="ms-switch-row" style={{ marginBottom: 12 }}>
          <span className="ms-row-name">
            Plano de fundo
            <span className="ms-row-sub">
              A foto é reduzida e desfocada aqui no aparelho antes de ser salva.
            </span>
          </span>
        </div>
        <div className="ms-scene-picker">
          {SCENE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ms-scene-option${scene.preset === p.id ? ' active' : ''}`}
              disabled={busy}
              onClick={() => void run(() => choosePreset(p.id))}
              aria-pressed={scene.preset === p.id}
            >
              <span className={`ms-scene-swatch ${p.id}`} />
              {p.label}
            </button>
          ))}

          {scene.image && (
            <button
              type="button"
              className={`ms-scene-option${scene.preset === 'custom' ? ' active' : ''}`}
              disabled={busy}
              onClick={() => void run(() => chooseCustom())}
              aria-pressed={scene.preset === 'custom'}
            >
              <span className="ms-scene-swatch" style={{ backgroundImage: `url(${scene.image})` }} />
              Minha foto
            </button>
          )}

          <button
            type="button"
            className="ms-scene-option"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <span className="ms-scene-swatch empty">
              <ImageIcon />
            </span>
            {busy ? 'Processando…' : scene.image ? 'Trocar foto' : 'Enviar foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
        </div>
        {error && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div className="ms-row">
        <span className="ms-row-name">
          Reduzir transparência
          <span className="ms-row-sub">Cards sólidos e sem desfoque, só neste aparelho. Use se o app pesar.</span>
        </span>
        <span className="ms-row-actions ms-row-actions-fixed">
          <button className={`ms-btn${glassOff ? ' ms-btn-ink' : ''}`} onClick={() => setGlassOff(!glassOff)}>
            {glassOff ? 'Ligado' : 'Desligado'}
          </button>
        </span>
      </div>
    </section>
  );
}
