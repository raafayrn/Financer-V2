/**
 * Casa o nome de categoria sugerido pelo parser com uma categoria cadastrada.
 * Sem correspondência devolve null — o nome sugerido continua guardado à
 * parte, para a tela poder mostrar "a IA achou que era X".
 */
export function matchCategoryByName(
  suggested: string | null,
  categories: { id: string; name: string }[],
): string | null {
  const normalized = suggested?.trim().toLowerCase() ?? null;
  if (!normalized) return null;
  return categories.find((c) => c.name.toLowerCase() === normalized)?.id ?? null;
}
