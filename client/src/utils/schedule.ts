/**
 * Grade de aulas do semestre — fonte única.
 *
 * Antes este objeto estava duplicado em HomePage.tsx e EstudosPage.tsx, o que
 * obrigava a editar dois arquivos a cada semestre novo. Só se altera aqui.
 *
 * Chave = dia da semana no padrão de `Date.getDay()` (0=Dom … 6=Sáb).
 */
export interface ClassSlot {
  time: string;
  name: string;
}

export const CLASS_SCHEDULE: Record<number, ClassSlot[]> = {
  1: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  2: [
    { time: '18:55–20:35', name: 'Física Geral e Experimental II' },
    { time: '20:50–22:30', name: 'Estática em Engenharia' },
  ],
  3: [
    { time: '18:55–20:35', name: 'Cálculo Diferencial e Integral II' },
    { time: '20:50–22:30', name: 'Física Geral e Experimental II' },
  ],
  4: [
    { time: '18:55–20:35', name: 'Geometria e Álgebra Linear' },
    { time: '20:50–22:30', name: 'Introdução à Ciência dos Materiais' },
  ],
  5: [
    { time: '18:55–20:35', name: 'Desenho e Modelagem Geométrica' },
    { time: '20:50–22:30', name: 'Geometria e Álgebra Linear' },
  ],
};

/** Aulas de um dia da semana (vazio em fim de semana). */
export function classesForWeekday(weekday: number): ClassSlot[] {
  return CLASS_SCHEDULE[weekday] ?? [];
}
