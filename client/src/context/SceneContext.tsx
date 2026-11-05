import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import type { BackgroundPreset, BackgroundSetting } from '../api/types';
import { useAuth } from './AuthContext';

/**
 * Plano de fundo do app (a "cena" atrás do vidro) e a opção de reduzir a
 * transparência.
 *
 * - A cena mora no servidor, para o fundo trocado no computador aparecer no
 *   iPhone. O localStorage guarda uma cópia só para a primeira pintura não
 *   piscar com a cena padrão enquanto a API responde.
 * - "Reduzir transparência" é por aparelho (fica só no localStorage): é a
 *   saída para quando o vidro pesar num aparelho específico.
 */

const CACHE_KEY = 'orbit.scene';
const GLASS_KEY = 'orbit.glass';

interface SceneContextValue {
  scene: BackgroundSetting;
  /** Troca para uma cena embutida (mantém a foto guardada). */
  choosePreset: (preset: Exclude<BackgroundPreset, 'custom'>) => Promise<void>;
  /** Usa a foto (já processada) como fundo. Sem argumento, volta à foto guardada. */
  chooseCustom: (image?: string) => Promise<void>;
  glassOff: boolean;
  setGlassOff: (off: boolean) => void;
}

const DEFAULT_SCENE: BackgroundSetting = { preset: 'aurora', image: null };

function readCache(): BackgroundSetting {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_SCENE;
    const parsed = JSON.parse(raw) as BackgroundSetting;
    return parsed && typeof parsed.preset === 'string' ? parsed : DEFAULT_SCENE;
  } catch {
    return DEFAULT_SCENE;
  }
}

function writeCache(scene: BackgroundSetting) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(scene));
  } catch {
    // Cota estourada: o fundo continua vindo do servidor, só pisca na abertura.
  }
}

const SceneContext = createContext<SceneContextValue | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [scene, setScene] = useState<BackgroundSetting>(readCache);
  const [glassOff, setGlassOffState] = useState(() => localStorage.getItem(GLASS_KEY) === 'off');

  const apply = useCallback((next: BackgroundSetting) => {
    setScene(next);
    writeCache(next);
  }, []);

  // A versão do servidor vence a do cache assim que houver sessão.
  useEffect(() => {
    if (!user) return;
    api
      .getBackground()
      .then(apply)
      .catch(() => {
        // Sem API, fica a cena do cache.
      });
  }, [user, apply]);

  useEffect(() => {
    document.documentElement.setAttribute('data-glass', glassOff ? 'off' : 'on');
  }, [glassOff]);

  const choosePreset = useCallback(
    async (preset: Exclude<BackgroundPreset, 'custom'>) => {
      const previous = scene;
      apply({ ...scene, preset });
      try {
        apply(await api.setBackground({ preset }));
      } catch (err) {
        apply(previous);
        throw err;
      }
    },
    [scene, apply],
  );

  const chooseCustom = useCallback(
    async (image?: string) => {
      const previous = scene;
      const img = image ?? scene.image;
      if (!img) return;
      apply({ preset: 'custom', image: img });
      try {
        apply(await api.setBackground({ preset: 'custom', image: img }));
      } catch (err) {
        apply(previous);
        throw err;
      }
    },
    [scene, apply],
  );

  const setGlassOff = useCallback((off: boolean) => {
    setGlassOffState(off);
    localStorage.setItem(GLASS_KEY, off ? 'off' : 'on');
  }, []);

  const value = useMemo(
    () => ({ scene, choosePreset, chooseCustom, glassOff, setGlassOff }),
    [scene, choosePreset, chooseCustom, glassOff, setGlassOff],
  );

  return (
    <SceneContext.Provider value={value}>
      <SceneLayer scene={scene} />
      {children}
    </SceneContext.Provider>
  );
}

/**
 * A cena em si: uma camada fixa atrás de tudo. A foto já chega desfocada
 * (ver lib/scene.ts), então aqui não há `filter` nenhum.
 */
function SceneLayer({ scene }: { scene: BackgroundSetting }) {
  const custom = scene.preset === 'custom' && scene.image;
  return (
    <div
      className={`ms-scene ms-scene-${custom ? 'custom' : scene.preset === 'custom' ? 'aurora' : scene.preset}`}
      aria-hidden="true"
    >
      {custom && <div className="ms-scene-photo" style={{ backgroundImage: `url(${scene.image})` }} />}
    </div>
  );
}

export function useScene(): SceneContextValue {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene deve ser usado dentro de SceneProvider.');
  return ctx;
}
