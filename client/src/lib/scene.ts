import type { BackgroundPreset } from '../api/types';

/**
 * Cenas de fundo. As embutidas são gradientes definidos por tema no
 * monarch.css (--scene-aurora, --scene-dusk); 'plain' é o fundo liso; 'custom'
 * é a foto que o usuário escolheu em Ajustes.
 */
export const SCENE_PRESETS: { id: Exclude<BackgroundPreset, 'custom'>; label: string }[] = [
  { id: 'aurora', label: 'Âmbar' },
  { id: 'dusk', label: 'Entardecer' },
  { id: 'plain', label: 'Liso' },
];

/**
 * Lado maior da foto guardada. A cena é exibida desfocada e esticada na tela
 * inteira, então não precisa de resolução: 480px desfocados ficam iguais a
 * 3000px desfocados, e cabem em ~20 KB (sincronizam pelo servidor e voltam
 * do cache do localStorage sem piscar).
 */
const MAX_SIDE = 480;
/** Raio do desfoque na escala reduzida (~25px numa tela de 1440px). */
const BLUR_RADIUS = 8;
const PASSES = 3;
/** Teto do data URL — o servidor recusa acima de 180 mil caracteres. */
const MAX_CHARS = 170_000;

/**
 * Lê a foto, reduz e desfoca no próprio aparelho. O desfoque é feito aqui, uma
 * vez, e não com `filter: blur()` no CSS: assim a cena é só uma imagem parada
 * e o iPhone não recalcula desfoque nenhum ao rolar a tela.
 */
export async function prepareSceneImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const bitmap = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Este navegador não consegue processar a imagem.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  // Três passadas de média móvel ≈ desfoque gaussiano, e funcionam em
  // qualquer navegador (o `ctx.filter` não existe no Safari antigo).
  for (let i = 0; i < PASSES; i++) boxBlur(img.data, w, h, BLUR_RADIUS);
  ctx.putImageData(img, 0, 0);

  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error('Não deu para reduzir a imagem o suficiente. Tente outra foto.');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir essa imagem.'));
    };
    img.src = url;
  });
}

/** Média móvel horizontal + vertical, com a borda repetida. Opera no lugar. */
function boxBlur(px: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Float32Array(px.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += px[(y * w + clamp(k, w)) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = acc / win;
        acc += px[(y * w + clamp(x + r + 1, w)) * 4 + c] - px[(y * w + clamp(x - r, w)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(clamp(k, h) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        px[(y * w + x) * 4 + c] = acc / win;
        acc += tmp[(clamp(y + r + 1, h) * w + x) * 4 + c] - tmp[(clamp(y - r, h) * w + x) * 4 + c];
      }
    }
  }
}

function clamp(i: number, n: number) {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}
