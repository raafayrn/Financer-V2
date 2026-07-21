import type { WorkoutKind } from '../api/types';

export type MuscleGroup =
  | 'Peito'
  | 'Costas'
  | 'Pernas'
  | 'Ombro'
  | 'Bíceps'
  | 'Tríceps'
  | 'Abdômen'
  | 'Cardio';

export interface LibraryExercise {
  name: string;
  muscleGroup: MuscleGroup;
  targetSets: number | null;
  targetReps: string;
}

// Biblioteca de exercícios essenciais, usada tanto para sugerir exercícios ao
// montar a rotina quanto para gerar o treino do dia automaticamente a partir
// do(s) grupo(s) muscular(es) escolhido(s).
export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: 'Supino reto', muscleGroup: 'Peito', targetSets: 4, targetReps: '8-12' },
  { name: 'Supino inclinado com halteres', muscleGroup: 'Peito', targetSets: 3, targetReps: '10-12' },
  { name: 'Crucifixo', muscleGroup: 'Peito', targetSets: 3, targetReps: '12-15' },
  { name: 'Flexão de braço', muscleGroup: 'Peito', targetSets: 3, targetReps: 'até a falha' },

  { name: 'Puxada frente', muscleGroup: 'Costas', targetSets: 4, targetReps: '8-12' },
  { name: 'Remada curvada', muscleGroup: 'Costas', targetSets: 4, targetReps: '8-12' },
  { name: 'Remada unilateral', muscleGroup: 'Costas', targetSets: 3, targetReps: '10-12' },
  { name: 'Puxada supinada', muscleGroup: 'Costas', targetSets: 3, targetReps: '10-12' },

  { name: 'Agachamento livre', muscleGroup: 'Pernas', targetSets: 4, targetReps: '8-12' },
  { name: 'Leg press', muscleGroup: 'Pernas', targetSets: 4, targetReps: '10-12' },
  { name: 'Cadeira extensora', muscleGroup: 'Pernas', targetSets: 3, targetReps: '12-15' },
  { name: 'Mesa flexora', muscleGroup: 'Pernas', targetSets: 3, targetReps: '12-15' },
  { name: 'Panturrilha em pé', muscleGroup: 'Pernas', targetSets: 4, targetReps: '15-20' },

  { name: 'Desenvolvimento com halteres', muscleGroup: 'Ombro', targetSets: 4, targetReps: '8-12' },
  { name: 'Elevação lateral', muscleGroup: 'Ombro', targetSets: 3, targetReps: '12-15' },
  { name: 'Elevação frontal', muscleGroup: 'Ombro', targetSets: 3, targetReps: '12-15' },
  { name: 'Remada alta', muscleGroup: 'Ombro', targetSets: 3, targetReps: '10-12' },

  { name: 'Rosca direta', muscleGroup: 'Bíceps', targetSets: 3, targetReps: '10-12' },
  { name: 'Rosca alternada', muscleGroup: 'Bíceps', targetSets: 3, targetReps: '10-12' },
  { name: 'Rosca martelo', muscleGroup: 'Bíceps', targetSets: 3, targetReps: '10-12' },

  { name: 'Tríceps corda', muscleGroup: 'Tríceps', targetSets: 3, targetReps: '10-12' },
  { name: 'Tríceps testa', muscleGroup: 'Tríceps', targetSets: 3, targetReps: '10-12' },
  { name: 'Mergulho no banco', muscleGroup: 'Tríceps', targetSets: 3, targetReps: '12-15' },

  { name: 'Prancha', muscleGroup: 'Abdômen', targetSets: 3, targetReps: '30-60s' },
  { name: 'Abdominal supra', muscleGroup: 'Abdômen', targetSets: 3, targetReps: '15-20' },
  { name: 'Elevação de pernas', muscleGroup: 'Abdômen', targetSets: 3, targetReps: '15' },

  { name: 'Corrida', muscleGroup: 'Cardio', targetSets: 1, targetReps: '20-30min' },
  { name: 'Bicicleta ergométrica', muscleGroup: 'Cardio', targetSets: 1, targetReps: '20-30min' },
  { name: 'Pular corda', muscleGroup: 'Cardio', targetSets: 3, targetReps: '3min' },
];

export interface DayPreset {
  id: string;
  label: string;
  kind: WorkoutKind;
  groups: MuscleGroup[];
}

// Combinações comuns de "treino do dia". Selecionar um preset preenche o nome
// e o tipo do dia e gera automaticamente os exercícios daquele(s) grupo(s).
export const DAY_PRESETS: DayPreset[] = [
  { id: 'peito-triceps', label: 'Peito e tríceps', kind: 'STRENGTH', groups: ['Peito', 'Tríceps'] },
  { id: 'costas-biceps', label: 'Costas e bíceps', kind: 'STRENGTH', groups: ['Costas', 'Bíceps'] },
  { id: 'pernas', label: 'Pernas', kind: 'STRENGTH', groups: ['Pernas'] },
  { id: 'ombro-abdomen', label: 'Ombro e abdômen', kind: 'STRENGTH', groups: ['Ombro', 'Abdômen'] },
  { id: 'corpo-inteiro', label: 'Corpo inteiro', kind: 'STRENGTH', groups: ['Peito', 'Costas', 'Pernas', 'Ombro'] },
  { id: 'cardio', label: 'Cardio', kind: 'CARDIO', groups: ['Cardio'] },
];

export function exercisesForGroups(groups: MuscleGroup[]): LibraryExercise[] {
  return EXERCISE_LIBRARY.filter((e) => groups.includes(e.muscleGroup));
}

/**
 * Link de busca no YouTube para o exercício (em vez de um vídeo específico
 * embutido, que poderia sair do ar ou estar desatualizado). Sempre resolve
 * para resultados relevantes e atuais.
 */
export function exerciseVideoSearchUrl(exerciseName: string): string {
  const query = `${exerciseName} como fazer exercício`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
