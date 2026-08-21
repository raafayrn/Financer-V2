import { BRAND_ICONS, type BrandIcon as Brand } from '../lib/brandIcons';

/** Minúsculas, sem acento — "Duolingo Súper" e "duolingo super" viram iguais. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Índice alias → marca, com os aliases longos primeiro: "hbo max" tem que
 * ganhar de "max" numa descrição que contenha os dois.
 */
const INDEX: { alias: string; brand: Brand }[] = BRAND_ICONS.flatMap((brand) =>
  brand.aliases.map((alias) => ({ alias: normalize(alias), brand })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Acha a marca cuja palavra aparece na descrição do lançamento. Casa em borda
 * de palavra para "Nu" não pegar "Nuvem" nem "Numerário".
 */
export function findBrand(description: string): Brand | null {
  const text = normalize(description);
  for (const { alias, brand } of INDEX) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text)) return brand;
  }
  return null;
}

/**
 * Fundo lavado da cor. Usa color-mix porque a cor tanto pode ser um hex da
 * marca ("#E50914") quanto uma variável do tema ("var(--ok)") — concatenar um
 * alfa no fim só funcionaria no primeiro caso.
 */
function tint(color: string): string {
  return `color-mix(in srgb, ${color} 12%, transparent)`;
}

/**
 * Logo da marca no seu tom oficial, ou um círculo com a inicial quando a marca
 * não está no catálogo. Os ícones vêm embutidos no bundle (simple-icons, CC0):
 * nenhuma requisição sai do app, então a lista de assinaturas não vaza para
 * terceiros e o PWA continua funcionando offline.
 */
export function BrandIcon({
  description,
  fallbackColor,
  size = 34,
}: {
  description: string;
  /** Cor do círculo quando não há marca — normalmente a da categoria. */
  fallbackColor?: string;
  size?: number;
}) {
  const brand = findBrand(description);

  if (!brand) {
    const color = fallbackColor ?? 'var(--text-faint)';
    return (
      <span
        className="ms-brand ms-brand-fallback"
        style={{ width: size, height: size, background: tint(color), color }}
        aria-hidden="true"
      >
        {description.trim().slice(0, 1).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    <span
      className="ms-brand"
      style={{ width: size, height: size, background: tint(brand.hex) }}
      title={brand.title}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} role="img" aria-label={brand.title}>
        <path d={brand.path} fill={brand.hex} />
      </svg>
    </span>
  );
}
