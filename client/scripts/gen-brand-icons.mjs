/**
 * Gera src/lib/brandIcons.ts a partir do pacote simple-icons.
 *
 * Por que gerar em vez de importar direto: o simple-icons exporta 3400+ marcas
 * e a busca aqui é dinâmica (pela descrição do lançamento), o que impede o
 * bundler de descartar o que não se usa. Um subconjunto curado mantém o bundle
 * pequeno e deixa o app funcionando offline, sem pedir logo a servidor nenhum.
 *
 * Para adicionar uma marca: inclua em BRANDS e rode `npm run gen:brands`.
 *
 * O campo `aliases` são as palavras que aparecem na descrição do lançamento
 * ("netflix", "hbo max"). Sempre em minúsculas e sem acento.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'lib', 'brandIcons.ts');

/** [chave do simple-icons, aliases extras além do próprio título] */
const BRANDS = [
  // Streaming de vídeo
  ['siNetflix', []],
  ['siHbomax', ['hbo', 'hbomax']],
  ['siMax', []],
  ['siParamountplus', ['paramount']],
  ['siAppletv', ['apple tv', 'appletv']],
  ['siCrunchyroll', []],
  ['siYoutube', ['youtube premium']],
  // Música e áudio
  ['siSpotify', []],
  ['siDeezer', []],
  ['siTidal', []],
  ['siAudible', []],
  ['siApplemusic', ['apple music']],
  ['siSoundcloud', []],
  // Nuvem e produtividade
  ['siIcloud', ['icloud+', 'apple one']],
  ['siDropbox', []],
  ['siGoogledrive', ['google one', 'google drive']],
  ['siNotion', []],
  ['siFigma', []],
  ['siGithub', ['github copilot']],
  ['siAnthropic', ['claude']],
  // Jogos
  ['siPlaystation', ['ps plus', 'playstation plus']],
  ['siSteam', []],
  ['siEa', ['ea play']],
  // Serviços do dia a dia
  ['siIfood', ['ifood clube']],
  ['siUber', ['uber one']],
  ['siUbereats', ['uber eats']],
  ['siMercadopago', ['mercado pago', 'mercado livre']],
  ['siNubank', ['nu', 'nubank ultravioleta']],
  ['siDuolingo', ['duolingo plus', 'duolingo super']],
  ['siStrava', []],
  // Telecom / utilidades
  ['siVivo', []],
  // Investimentos (aparecem na aba Investimentos)
  ['siBitcoin', ['btc']],
  ['siEthereum', ['eth']],
  ['siBinance', []],
  ['siCoinbase', []],
];

const icons = [];
const faltando = [];

for (const [key, aliases] of BRANDS) {
  const icon = si[key];
  if (!icon) {
    faltando.push(key);
    continue;
  }
  const todos = [icon.title.toLowerCase(), icon.slug, ...aliases];
  icons.push({
    slug: icon.slug,
    title: icon.title,
    hex: `#${icon.hex}`,
    path: icon.path,
    aliases: [...new Set(todos)].sort(),
  });
}

if (faltando.length) {
  console.warn(`Sem ícone no simple-icons (ignoradas): ${faltando.join(', ')}`);
}

// Aliases mais longos primeiro: "hbo max" tem que ganhar de "max".
icons.sort((a, b) => a.slug.localeCompare(b.slug));

const body = icons
  .map(
    (i) =>
      `  {\n    slug: ${JSON.stringify(i.slug)},\n    title: ${JSON.stringify(i.title)},\n    hex: ${JSON.stringify(i.hex)},\n    aliases: ${JSON.stringify(i.aliases)},\n    path: ${JSON.stringify(i.path)},\n  },`,
  )
  .join('\n');

const out = `/**
 * GERADO POR scripts/gen-brand-icons.mjs — NÃO EDITE À MÃO.
 * Para incluir uma marca nova, edite BRANDS no script e rode: npm run gen:brands
 *
 * Subconjunto do simple-icons (CC0). Fica embutido no bundle de propósito: o
 * app nunca pede logo a um servidor externo, então não vaza quais serviços o
 * usuário assina e continua funcionando offline.
 */
export interface BrandIcon {
  slug: string;
  title: string;
  /** Cor oficial da marca. */
  hex: string;
  /** Termos que casam com a descrição do lançamento, em minúsculas e sem acento. */
  aliases: string[];
  /** \`d\` do <path> num viewBox 0 0 24 24. */
  path: string;
}

export const BRAND_ICONS: BrandIcon[] = [
${body}
];
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');
console.log(`${icons.length} marcas escritas em src/lib/brandIcons.ts`);
